import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/src/store";
import { t, Lang } from "@/src/i18n";
import { colors, radius, spacing, typeScale } from "@/src/theme";

export default function ProfileTab() {
  const { lang, setLang, userPhone, logout } = useApp();
  const router = useRouter();

  const onLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(lang, "profile")}</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name="call" size={22} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t(lang, "phone_label")}</Text>
            <Text style={styles.value}>{userPhone || "—"}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.section}>{t(lang, "choose_language")}</Text>
      <View style={styles.langRow}>
        {(["en", "gu"] as Lang[]).map((l) => {
          const active = lang === l;
          return (
            <Pressable
              key={l}
              testID={`lang-switch-${l}`}
              style={[styles.langChip, active && styles.langChipActive]}
              onPress={() => setLang(l)}
            >
              <Text style={[styles.langText, active && styles.langTextActive]}>
                {l === "en" ? "English" : "ગુજરાતી"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable testID="logout-btn" style={styles.logout} onPress={onLogout}>
        <Ionicons name="log-out" size={20} color={colors.error} />
        <Text style={styles.logoutText}>{t(lang, "logout")}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  header: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontSize: typeScale.xxl, fontWeight: "800", color: colors.onSurface },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  label: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary },
  value: { fontSize: typeScale.lg, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  section: { fontSize: typeScale.base, fontWeight: "700", color: colors.onSurfaceTertiary, marginTop: spacing.lg, marginBottom: spacing.sm },
  langRow: { flexDirection: "row", gap: spacing.sm },
  langChip: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
  },
  langChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  langText: { fontSize: typeScale.base, fontWeight: "700", color: colors.onSurfaceTertiary },
  langTextActive: { color: colors.brand },
  logout: {
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center",
    marginTop: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.error,
    backgroundColor: "#FDECEA",
  },
  logoutText: { color: colors.error, fontWeight: "700" },
});
