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
  WebLn = "webln",
  NWC = "nwc",
}

export type Wallet =
  | {
      type: WalletType.WebLn
      info: WebLNInfo
    }
  | {
      type: WalletType.NWC
      info: NWCInfo
    }
