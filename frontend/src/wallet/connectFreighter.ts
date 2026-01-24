import {
  requestAccess,
  getPublicKey
} from "@stellar/freighter-api";

export async function connectFreighter() {
  await requestAccess(); // THIS triggers popup
  const publicKey = await getPublicKey();
  return publicKey;
}
