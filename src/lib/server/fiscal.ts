import "server-only";
import { createOblioIssuer, readOblioConfig, type FiscalIssuer } from "../billing/oblio";

let issuer: FiscalIssuer | undefined;
export const issueWithOblio: FiscalIssuer = (invoice, profile) => {
  issuer ??= createOblioIssuer(readOblioConfig());
  return issuer(invoice, profile);
};
