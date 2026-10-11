import AsyncStorage from "@react-native-async-storage/async-storage";
import { PublicKey, PublicKeyInitData } from "@solana/web3.js";
import {
  Account as AuthorizedAccount,
  AuthorizationResult,
  AuthorizeAPI,
  AuthToken,
  Base64EncodedAddress,
  DeauthorizeAPI,
  SignInPayloadWithRequiredFields,
  SignInPayload,
} from "@solana-mobile/mobile-wallet-adapter-protocol";
import { toUint8Array } from "js-base64";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { reusableAuthToken } from "./walletChoice";
import { CHAIN_IDENTIFIER } from "./walletNetwork";
import { logNote } from "./diagnostics";

export type Account = Readonly<{
  address: Base64EncodedAddress;
  label?: string;
  publicKey: PublicKey;
  chains?: readonly string[];
}>;

type WalletAuthorization = Readonly<{
  accounts: Account[];
  authToken: AuthToken;
  selectedAccount: Account;
  /** Android package of the wallet that issued authToken; null = implicit default. */
  walletPackage?: string | null;
}>;

function getAccountFromAuthorizedAccount(account: AuthorizedAccount): Account {
  return {
    ...account,
    publicKey: getPublicKeyFromAddress(account.address),
  };
}

export function getAuthorizationFromAuthorizationResult(
  authorizationResult: AuthorizationResult,
  previouslySelectedAccount: Account | undefined,
  walletPackage: string | null
): WalletAuthorization {
  // Always use the fresh account metadata, even when the address is unchanged.
  const selected = authorizationResult.accounts.find(({ address }) => address === previouslySelectedAccount?.address) ?? authorizationResult.accounts[0];
  const selectedAccount = getAccountFromAuthorizedAccount(selected);
  logNote('mwa.authorize.chains', JSON.stringify(selectedAccount.chains ?? null));
  return {
    accounts: authorizationResult.accounts.map(getAccountFromAuthorizedAccount),
    authToken: authorizationResult.auth_token,
    selectedAccount,
    walletPackage,
  };
}

function getPublicKeyFromAddress(address: Base64EncodedAddress): PublicKey {
  const publicKeyByteArray = toUint8Array(address);
  return new PublicKey(publicKeyByteArray);
}

function cacheReviver(key: string, value: any) {
  if (key === "publicKey") {
    return new PublicKey(value as PublicKeyInitData); // the PublicKeyInitData should match the actual data structure stored in AsyncStorage
  } else {
    return value;
  }
}

const AUTHORIZATION_STORAGE_KEY = "authorization-cache";

async function fetchAuthorization(): Promise<WalletAuthorization | null> {
  const cacheFetchResult = await AsyncStorage.getItem(
    AUTHORIZATION_STORAGE_KEY
  );

  if (!cacheFetchResult) {
    return null;
  }

  // Return prior authorization, if found.
  return JSON.parse(cacheFetchResult, cacheReviver);
}

async function persistAuthorization(
  auth: WalletAuthorization | null
): Promise<void> {
  await AsyncStorage.setItem(AUTHORIZATION_STORAGE_KEY, JSON.stringify(auth));
}

export const APP_IDENTITY = {
  name: "Rituals",
  // The product's own https origin (Vercel project rituals-site, 2026-10-06):
  // the wallet shows this name and icon at approval time, not "github.com".
  uri: "https://rituals.whoknowsman.com",
  icon: "icon.png",
};

export function useAuthorization() {
  const queryClient = useQueryClient();
  const { data: authorization, isLoading } = useQuery({
    queryKey: ["wallet-authorization"],
    queryFn: () => fetchAuthorization(),
    // Read once from storage; later changes arrive through setQueryData. A refetch on
    // every mount re-created the account objects, which re-created the wallet callbacks,
    // the ritual client and Home's load: Home reloaded in a loop (d42, 2026-10-10).
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const { mutateAsync: setAuthorization } = useMutation({
    mutationFn: persistAuthorization,
    onSuccess: (_result, auth) => {
      queryClient.setQueryData(["wallet-authorization"], auth);
    },
  });

  const handleAuthorizationResult = useCallback(
    async (
      authorizationResult: AuthorizationResult,
      walletPackage: string | null
    ): Promise<WalletAuthorization> => {
      // A different wallet means a different account set; never carry the
      // previous wallet's selection across.
      const sameWallet = (authorization?.walletPackage ?? null) === walletPackage;
      const nextAuthorization = getAuthorizationFromAuthorizationResult(
        authorizationResult,
        sameWallet ? authorization?.selectedAccount : undefined,
        walletPackage
      );
      await setAuthorization(nextAuthorization);
      return nextAuthorization;
    },
    [authorization]
  );
  const authorizeSession = useCallback(
    async (wallet: AuthorizeAPI, walletPackage: string | null = authorization?.walletPackage ?? null) => {
      const authorizationResult = await wallet.authorize({
        identity: APP_IDENTITY,
        chain: CHAIN_IDENTIFIER,
        auth_token: reusableAuthToken(authorization, walletPackage),
      });
      return (await handleAuthorizationResult(authorizationResult, walletPackage))
        .selectedAccount;
    },
    [authorization, handleAuthorizationResult]
  );
  const authorizeSessionWithSignIn = useCallback(
    async (wallet: AuthorizeAPI, signInPayload: SignInPayload, walletPackage: string | null = authorization?.walletPackage ?? null) => {
      const authorizationResult = await wallet.authorize({
        identity: APP_IDENTITY,
        chain: CHAIN_IDENTIFIER,
        auth_token: reusableAuthToken(authorization, walletPackage),
        sign_in_payload: signInPayload,
      });
      return (await handleAuthorizationResult(authorizationResult, walletPackage))
        .selectedAccount;
    },
    [authorization, handleAuthorizationResult]
  );
  const deauthorizeSession = useCallback(
    async (wallet: DeauthorizeAPI) => {
      if (authorization?.authToken == null) {
        return;
      }
      await wallet.deauthorize({ auth_token: authorization.authToken });
      await setAuthorization(null);
    },
    [authorization]
  );
  const clearAuthorization = useCallback(async () => { await persistAuthorization(null); queryClient.setQueryData(["wallet-authorization"], null); }, [queryClient]);
  const getCurrentAccount = useCallback(() => queryClient.getQueryData<WalletAuthorization | null>(["wallet-authorization"])?.selectedAccount ?? null, [queryClient]);
  return useMemo(
    () => ({
      accounts: authorization?.accounts ?? null,
      clearAuthorization,
      getCurrentAccount,
      authorizeSession,
      authorizeSessionWithSignIn,
      deauthorizeSession,
      selectedAccount: authorization?.selectedAccount ?? null,
      walletPackage: authorization?.walletPackage ?? null,
      isLoading,
    }),
    [authorization, authorizeSession, authorizeSessionWithSignIn, clearAuthorization, deauthorizeSession, getCurrentAccount, isLoading]
  );
}
