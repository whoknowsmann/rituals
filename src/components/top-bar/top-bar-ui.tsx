import { Button, IconButton, Menu, useTheme } from "react-native-paper";
import { Account, useAuthorization } from "../../utils/useAuthorization";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { useNavigation } from "@react-navigation/native";
import { ellipsify } from "../../utils/ellipsify";
import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";
import { useCluster } from "../cluster/cluster-data-access";
import { CONNECT_OPTIONS, walletNotFound, walletOptionByPackage, type WalletOption } from "../../utils/walletChoice";

export function TopBarWalletButton({
  selectedAccount,
  openMenu,
}: {
  selectedAccount: Account | null;
  openMenu: () => void;
}) {
  return (
    <Button
      icon="wallet"
      mode="contained-tonal"
      style={{ alignSelf: "center" }}
      onPress={openMenu}
    >
      {selectedAccount
        ? ellipsify(selectedAccount.publicKey.toBase58())
        : "Connect"}
    </Button>
  );
}

export function TopBarSettingsButton() {
  const navigation = useNavigation();
  return (
    <IconButton
      icon="cog"
      mode="contained-tonal"
      onPress={() => {
        navigation.navigate("Settings");
      }}
    />
  );
}

export function TopBarWalletMenu() {
  const { selectedAccount, walletPackage } = useAuthorization();
  const { getExplorerUrl } = useCluster();
  const [visible, setVisible] = useState(false);
  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);
  const { disconnect, connect } = useMobileWallet();
  const [notice, setNotice] = useState<string | null>(null);

  const connectWith = async (option: WalletOption) => {
    closeMenu();
    try {
      await connect(option.androidPackage);
      setNotice(null);
    } catch (error) {
      setNotice(walletNotFound(error) ? `${option.label} is not installed` : "Connection not completed");
    }
  };

  const copyAddressToClipboard = async () => {
    if (selectedAccount) {
      await Clipboard.setStringAsync(selectedAccount.publicKey.toBase58());
    }
    closeMenu();
  };

  const viewExplorer = () => {
    if (selectedAccount) {
      const explorerUrl = getExplorerUrl(
        `account/${selectedAccount.publicKey.toBase58()}`
      );
      Linking.openURL(explorerUrl);
    }
    closeMenu();
  };

  return (
    <Menu
      visible={visible}
      onDismiss={closeMenu}
      anchor={
        <TopBarWalletButton
          selectedAccount={selectedAccount}
          openMenu={openMenu}
        />
      }
    >
      {!selectedAccount &&
        CONNECT_OPTIONS.map((option) => (
          <Menu.Item
            key={option.id}
            onPress={() => { void connectWith(option); }}
            title={option.label}
            leadingIcon="wallet"
            accessibilityLabel={`Connect with ${option.label}`}
          />
        ))}
      {notice && <Menu.Item title={notice} disabled />}
      {selectedAccount && walletOptionByPackage(walletPackage) && (
        <Menu.Item title={`Via ${walletOptionByPackage(walletPackage)?.label}`} leadingIcon="check" disabled />
      )}
      {selectedAccount && <Menu.Item
        onPress={copyAddressToClipboard}
        title="Copy address"
        leadingIcon="content-copy"
      />}
      {selectedAccount && <Menu.Item
        onPress={viewExplorer}
        title="View Explorer"
        leadingIcon="open-in-new"
      />}
      {selectedAccount && <Menu.Item
        onPress={async () => {
          try { await disconnect(); setNotice(null); closeMenu(); }
          catch { setNotice('Finish any open wallet request, then try disconnecting again.'); }
        }}
        title="Disconnect"
        leadingIcon="link-off"
      />}
    </Menu>
  );
}
