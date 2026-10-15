const DPO_ENDPOINT = process.env.DPO_API_URL || "https://secure.3gdirectpay.com/API/v6/";
const DPO_PAYMENT_URL = process.env.DPO_PAYMENT_URL || "https://secure.3gdirectpay.com/payv2.php";

type DpoCheckoutInput = {
  reference: string;
  amount: number;
  currency: string;
  itemName: string;
  customerName: string;
  customerEmail: string;
  backUrl: string;
  redirectUrl: string;
};

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const readXmlValue = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.trim() || "";
};

export async function createDpoCheckout(input: DpoCheckoutInput) {
  const companyToken = process.env.DPO_COMPANY_TOKEN;
  if (!companyToken) {
    throw new Error("DPO payment gateway is not configured. Add DPO_COMPANY_TOKEN to the server environment.");
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>${escapeXml(companyToken)}</CompanyToken><Request>createToken</Request><Transaction><PaymentAmount>${input.amount.toFixed(2)}</PaymentAmount><PaymentCurrency>${escapeXml(input.currency)}</PaymentCurrency><CompanyRef>${escapeXml(input.reference)}</CompanyRef><RedirectURL>${escapeXml(input.redirectUrl)}</RedirectURL><BackURL>${escapeXml(input.backUrl)}</BackURL><CompanyRefUnique>1</CompanyRefUnique><PTL>24</PTL></Transaction><Services><Service><ServiceType>45</ServiceType><ServiceDescription>${escapeXml(input.itemName)}</ServiceDescription><ServiceDate>${new Date().toISOString().slice(0, 10)}</ServiceDate></Service></Services></API3G>`;
  const response = await fetch(DPO_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/xml" }, body: xml, cache: "no-store" });
  const responseXml = await response.text();
  const result = readXmlValue(responseXml, "Result");
  const token = readXmlValue(responseXml, "TransToken");

  if (!response.ok || result !== "000" || !token) {
    throw new Error(readXmlValue(responseXml, "ResultExplanation") || `DPO could not create a payment token (result ${result || "unknown"}).`);
  }

  return { token, paymentUrl: `${DPO_PAYMENT_URL}?ID=${encodeURIComponent(token)}` };
}

export async function verifyDpoToken(token: string) {
  const companyToken = process.env.DPO_COMPANY_TOKEN;
  if (!companyToken || !token) return { paid: false, transactionId: "", result: "" };

  const xml = `<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>${escapeXml(companyToken)}</CompanyToken><Request>verifyToken</Request><TransactionToken>${escapeXml(token)}</TransactionToken></API3G>`;
  const response = await fetch(DPO_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/xml" }, body: xml, cache: "no-store" });
  const responseXml = await response.text();
  const result = readXmlValue(responseXml, "Result");
  return {
    paid: response.ok && result === "000",
    transactionId: readXmlValue(responseXml, "TransactionApproval") || readXmlValue(responseXml, "TransactionRef"),
    result,
  };
}

export async function parseDpoCallback(request: Request) {
  const body = await request.text();
  const params = new URLSearchParams(body);
  return {
    reference: params.get("CompanyRef") || params.get("companyRef") || "",
    token: params.get("TransactionToken") || params.get("TransToken") || "",
    transactionId: params.get("TransactionID") || "",
    result: params.get("Result") || "",
  };
}