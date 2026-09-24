/**
 * The app navigator (formerly "AppNavigator" and "MainNavigator") is used for the primary
 * navigation flows of your app.
 */
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { Appearance, useColorScheme } from "react-native";
import * as Screens from "../screens";
import { HomeNavigator } from "./HomeNavigator";
import { ritualsNavigationTheme, palette } from "../theme";
import { StatusBar } from "expo-status-bar";
import {
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
} from "react-native-paper";
import type { ConfirmationMode } from "../domain/rituals/types";
import type { FeePayerMode } from "../features/rituals/create/draftForm";
import type { RitualTemplateCategory } from "../features/rituals/create/templates";

/**
 * This type allows TypeScript to know what routes are defined in this navigator
 * as well as what properties (if any) they might take when navigating to them.
 *
 * If no params are allowed, pass through `undefined`.
 *
 * For more information, see this documentation:
 *   https://reactnavigation.org/docs/params/
 *   https://reactnavigation.org/docs/typescript#type-checking-the-navigator
 *   https://reactnavigation.org/docs/typescript/#organizing-types
 *
 */

export type RootStackParamList = {
  RitualsHome: undefined;
  Settings: undefined;
  TemplatePicker: undefined;
  CreateRitual: { templateCategory: RitualTemplateCategory };
  ReviewRitual: {
    title: string;
    requirement: string;
    memberCount: string;
    eventCount: string;
    memberTotalStake: string;
    confirmationMode: ConfirmationMode;
    feePayerMode: FeePayerMode;
  };
  RitualRoster: RootStackParamList['ReviewRitual'];
  RitualFundingLobby: RootStackParamList['ReviewRitual'] & { members: string[] };
  JoinRitual: { invite?: string };
  RitualAction: { ritualId: string; phase: 'fund' | 'activate' };
  RitualDetail: { ritualId: string };
  ClaimCompletion: { ritualId: string; eventIndex: number };
  ConfirmationInbox: { ritualId: string; eventIndex: number };
  SettlementReceipt: { ritualId: string; eventIndex: number };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

// Documentation: https://reactnavigation.org/docs/stack-navigator/
const Stack = createNativeStackNavigator<RootStackParamList>();

const AppStack = () => {
  return (
    <Stack.Navigator
      initialRouteName="RitualsHome"
      screenOptions={{
        headerStyle: { backgroundColor: palette.ink900 },
        headerTitleStyle: { color: palette.bone, fontWeight: '700' },
        headerTintColor: palette.gold500,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.ink900 },
      }}
    >
      <Stack.Screen
        name="RitualsHome"
        component={HomeNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Settings" component={Screens.SettingsScreen} />
      <Stack.Screen name="TemplatePicker" component={Screens.TemplatePickerScreen} options={{ title: 'Choose a template' }} />
      <Stack.Screen name="CreateRitual" component={Screens.CreateRitualScreen} options={{ title: 'Create Ritual' }} />
      <Stack.Screen name="ReviewRitual" component={Screens.ReviewRitualScreen} options={{ title: 'Review Ritual' }} />
      <Stack.Screen name="RitualRoster" component={Screens.RitualRosterScreen} options={{ title: 'Add member wallets' }} />
      <Stack.Screen name="RitualFundingLobby" component={Screens.RitualFundingLobbyScreen} options={{ title: 'Funding lobby' }} />
      <Stack.Screen name="JoinRitual" component={Screens.JoinRitualScreen} options={{ title: 'Join ritual' }} />
      <Stack.Screen name="RitualAction" component={Screens.RitualActionScreen} options={{ title: 'Ritual action' }} />
      <Stack.Screen name="RitualDetail" component={Screens.RitualDetailScreen} options={{ title: 'Ritual detail' }} />
      <Stack.Screen name="ClaimCompletion" component={Screens.ClaimCompletionScreen} options={{ title: 'Claim preview' }} />
      <Stack.Screen name="ConfirmationInbox" component={Screens.ConfirmationInboxScreen} options={{ title: 'Confirmations' }} />
      <Stack.Screen name="SettlementReceipt" component={Screens.SettlementReceiptScreen} options={{ title: 'Settlement receipt' }} />
    </Stack.Navigator>
  );
};

export interface NavigationProps
  extends Partial<React.ComponentProps<typeof NavigationContainer>> {}

export const AppNavigator = (props: NavigationProps) => {
  return (
    <NavigationContainer
      theme={ritualsNavigationTheme}
      {...props}
    >
      <StatusBar />
      <AppStack />
    </NavigationContainer>
  );
};
