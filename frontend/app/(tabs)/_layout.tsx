import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/store";
import { t } from "@/src/i18n";
import { colors } from "@/src/theme";

export default function TabsLayout() {
  const { token, ready, lang } = useApp();
  if (!ready) return null;
  if (!token) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t(lang, "dashboard"),
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: t(lang, "documents"),
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="expert"
        options={{
          title: t(lang, "expert"),
          tabBarIcon: ({ color, size }) => <Ionicons name="headset" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t(lang, "profile"),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
