import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/src/store";
import { t } from "@/src/i18n";
import { colors, radius, spacing, typeScale } from "@/src/theme";

const ALL_DOCS = ["aadhaar", "pan", "voter_id", "birth", "lc", "passport", "husband_aadhaar", "father_aadhaar", "mother_aadhaar"] as const;

export default function DocumentsTab() {
  const { lang, documents, refresh, profile } = useApp();
  const router = useRouter();
  const [_refreshing, _setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const visible = ALL_DOCS.filter((d) => {
    if (d === "husband_aadhaar") return !!profile?.is_married_lady;
    if (d === "father_aadhaar" || d === "mother_aadhaar") return !!profile?.is_minor;
    return true;
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(lang, "documents")}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {visible.map((d) => {
          const doc = documents.find((x) => x.doc_type === d);
          return (
            <Pressable
              key={d}
              testID={`doc-row-${d}`}
              style={styles.row}
              onPress={() => router.push(`/scan/${d}` as any)}
            >
              <View style={styles.iconWrap}>
                <Ionicons name="document-text" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t(lang, d as any)}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {doc ? `${doc.name || "—"} • ${doc.dob || "—"}` : (lang === "gu" ? "ઉમેરો" : "Not added")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          );
        })}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontSize: typeScale.xxl, fontWeight: "800", color: colors.onSurface },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontSize: typeScale.base, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
});
