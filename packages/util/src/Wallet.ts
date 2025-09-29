export type WebLNInfo = {
  methods?: string[]
  supports?: string[]
  version?: string
  node?: {
    alias: string
  }
}

export type NWCInfo = {
  lud16: string
  secret: string
  relayUrl: string
  walletPubkey: string
  nostrWalletConnectUrl: string
}

export enum WalletType {
  WebLN = "webln",
  NWC = "nwc",
}

export type WebLNWallet = {
  type: WalletType.WebLN
  info: WebLNInfo
}

export type NWCWallet = {
  type: WalletType.NWC
  info: NWCInfo
}

export type Wallet = WebLNWallet | NWCWallet

export const isWebLNWallet = (wallet: Wallet): wallet is WebLNWallet =>
  wallet.type === WalletType.WebLN

export const isNWCWallet = (wallet: Wallet): wallet is NWCWallet => wallet.type === WalletType.NWC
