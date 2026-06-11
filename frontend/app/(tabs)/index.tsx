import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useApp } from "@/src/store";
import { t, Lang } from "@/src/i18n";
import { colors, radius, spacing, typeScale } from "@/src/theme";

type RoadmapStep = {
  step: number;
  title_en: string;
  title_gu: string;
  detail_en: string;
  detail_gu: string;
  doc_type: string | null;
};
type RoadmapResp = {
  ready: boolean;
  base_doc_type: string | null;
  is_married_lady: boolean;
  is_minor?: boolean;
  needs_husband_aadhaar: boolean;
  needs_father_aadhaar?: boolean;
  needs_mother_aadhaar?: boolean;
  statuses: Record<string, "match" | "mismatch" | "pending">;
  roadmap: RoadmapStep[];
};

const BASE_OPTIONS = ["birth", "lc", "passport", "aadhaar"] as const;
const ALL_DOC_CARDS = ["aadhaar", "pan", "voter_id", "passport"] as const;

export default function Dashboard() {
  const { api, lang, profile, refresh } = useApp();
  const router = useRouter();
  const [road, setRoad] = useState<RoadmapResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);

  const loadRoadmap = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<RoadmapResp>("/api/verify/roadmap");
      setRoad(r);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      loadRoadmap();
    }, [refresh, loadRoadmap]),
  );

  useEffect(() => {
    loadRoadmap();
  }, [profile?.base_doc_type, profile?.is_married_lady, loadRoadmap]);

  const updateProfile = async (patch: Record<string, unknown>) => {
    try {
      await api("/api/profile/state", { method: "PUT", body: JSON.stringify(patch) });
      await refresh();
      await loadRoadmap();
    } catch (e) {
      console.warn(e);
    }
  };

  const onPickBase = async (b: string) => {
    Haptics.selectionAsync().catch(() => {});
    await updateProfile({ base_doc_type: b });
  };

  const onToggleML = async (val: boolean) => {
    setSavingToggle(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await updateProfile({ is_married_lady: val });
    setSavingToggle(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.brand}>{t(lang, "app_name")}</Text>
          <Text style={styles.brandSub}>{t(lang, "dashboard")}</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark" size={22} color={colors.brand} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Base Document Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t(lang, "base_doc_label")}</Text>
          <Text style={styles.sectionHint}>{t(lang, "base_doc_hint")}</Text>
          <View style={styles.baseRow}>
            {BASE_OPTIONS.map((opt) => {
              const active = profile?.base_doc_type === opt;
              return (
                <Pressable
                  key={opt}
                  testID={`base-${opt}-btn`}
                  onPress={() => onPickBase(opt)}
                  style={[styles.baseChip, active && styles.baseChipActive]}
                >
                  <Text style={[styles.baseChipText, active && styles.baseChipTextActive]} numberOfLines={2}>
                    {t(lang, opt as any)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Married Lady Toggle */}
        <View style={styles.toggleCard}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.toggleTitle}>{t(lang, "married_lady_toggle")}</Text>
            <Text style={styles.toggleHint}>{t(lang, "married_lady_hint")}</Text>
          </View>
          <Switch
            testID="married-lady-toggle"
            value={!!profile?.is_married_lady}
            onValueChange={onToggleML}
            disabled={savingToggle || !!profile?.is_minor}
            trackColor={{ false: colors.borderStrong, true: colors.brandSecondary }}
            thumbColor={profile?.is_married_lady ? colors.brand : "#FFF"}
          />
        </View>

        {/* Minor Toggle */}
        <View style={styles.toggleCard}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.toggleTitle}>{t(lang, "minor_toggle")}</Text>
            <Text style={styles.toggleHint}>{t(lang, "minor_hint")}</Text>
          </View>
          <Switch
            testID="minor-toggle"
            value={!!profile?.is_minor}
            onValueChange={async (val) => {
              setSavingToggle(true);
              await updateProfile({ is_minor: val });
              setSavingToggle(false);
            }}
            disabled={savingToggle || !!profile?.is_married_lady}
            trackColor={{ false: colors.borderStrong, true: colors.brandSecondary }}
            thumbColor={profile?.is_minor ? colors.brand : "#FFF"}
          />
        </View>

        {!profile?.base_doc_type ? (
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle" size={20} color={colors.warning} />
            <Text style={styles.noticeText}>{t(lang, "no_base_doc")}</Text>
          </View>
        ) : null}

        {/* Document Cards */}
        <Text style={styles.h2}>{t(lang, "documents")}</Text>
        {profile?.is_minor && profile?.base_doc_type !== "birth" ? (
          <View style={styles.noticeCard}>
            <Ionicons name="warning" size={20} color={colors.warning} />
            <Text style={styles.noticeText}>{t(lang, "minor_only_birth")}</Text>
          </View>
        ) : null}
        <View style={styles.cardGrid}>
          {ALL_DOC_CARDS.filter((d) => d !== profile?.base_doc_type).map((d) => {
            const status = road?.statuses?.[d] || "pending";
            const colorStyle = status === "match" ? styles.pillMatch : status === "mismatch" ? styles.pillMismatch : styles.pillPending;
            const label = status === "match" ? t(lang, "status_match") : status === "mismatch" ? t(lang, "status_mismatch") : t(lang, "status_pending");
            return (
              <Pressable
                key={d}
                testID={`doc-card-${d}`}
                style={styles.docCard}
                onPress={() => router.push(`/scan/${d}` as any)}
              >
                <View style={styles.docIconWrap}>
                  <Ionicons name="card" size={22} color={colors.brand} />
                </View>
                <Text style={styles.docTitle}>{t(lang, d as any)}</Text>
                <View style={[styles.pill, colorStyle]}>
                  <Text style={styles.pillText}>{label}</Text>
                </View>
              </Pressable>
            );
          })}
          {road?.needs_husband_aadhaar ? (
            <Pressable
              testID="doc-card-husband_aadhaar"
              style={[styles.docCard, { borderColor: colors.warning, borderWidth: 1 }]}
              onPress={() => router.push(`/scan/husband_aadhaar` as any)}
            >
              <View style={styles.docIconWrap}>
                <Ionicons name="people" size={22} color={colors.brand} />
              </View>
              <Text style={styles.docTitle}>{t(lang, "husband_aadhaar")}</Text>
              <View style={[styles.pill, styles.pillPending]}>
                <Text style={styles.pillText}>{t(lang, "status_pending")}</Text>
              </View>
            </Pressable>
          ) : null}
          {profile?.is_minor ? (
            <>
              <Pressable
                testID="doc-card-father_aadhaar"
                style={[styles.docCard, { borderColor: colors.warning, borderWidth: 1 }]}
                onPress={() => router.push(`/scan/father_aadhaar` as any)}
              >
                <View style={styles.docIconWrap}>
                  <Ionicons name="man" size={22} color={colors.brand} />
                </View>
                <Text style={styles.docTitle}>{t(lang, "father_aadhaar")}</Text>
                <View style={[
                  styles.pill,
                  road?.statuses?.father_aadhaar === "match"
                    ? styles.pillMatch
                    : road?.statuses?.father_aadhaar === "mismatch"
                    ? styles.pillMismatch
                    : styles.pillPending,
                ]}>
                  <Text style={styles.pillText}>
                    {road?.statuses?.father_aadhaar === "match"
                      ? t(lang, "status_match")
                      : road?.statuses?.father_aadhaar === "mismatch"
                      ? t(lang, "status_mismatch")
                      : t(lang, "status_pending")}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                testID="doc-card-mother_aadhaar"
                style={[styles.docCard, { borderColor: colors.warning, borderWidth: 1 }]}
                onPress={() => router.push(`/scan/mother_aadhaar` as any)}
              >
                <View style={styles.docIconWrap}>
                  <Ionicons name="woman" size={22} color={colors.brand} />
                </View>
                <Text style={styles.docTitle}>{t(lang, "mother_aadhaar")}</Text>
                <View style={[
                  styles.pill,
                  road?.statuses?.mother_aadhaar === "match"
                    ? styles.pillMatch
                    : road?.statuses?.mother_aadhaar === "mismatch"
                    ? styles.pillMismatch
                    : styles.pillPending,
                ]}>
                  <Text style={styles.pillText}>
                    {road?.statuses?.mother_aadhaar === "match"
                      ? t(lang, "status_match")
                      : road?.statuses?.mother_aadhaar === "mismatch"
                      ? t(lang, "status_mismatch")
                      : t(lang, "status_pending")}
                  </Text>
                </View>
              </Pressable>
            </>
          ) : null}
        </View>

        {/* Roadmap */}
        <Text style={styles.h2}>{t(lang, "roadmap_title")}</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />
        ) : (
          <View style={styles.roadmapWrap}>
            {(road?.roadmap || []).map((s, idx, arr) => (
              <View key={`${s.step}-${idx}`} style={styles.stepRow}>
                <View style={styles.stepLeft}>
                  <View style={styles.stepDot}>
                    <Text style={styles.stepDotText}>{s.step}</Text>
                  </View>
                  {idx < arr.length - 1 ? <View style={styles.stepLine} /> : null}
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTitle}>{lang === "gu" ? s.title_gu : s.title_en}</Text>
                  <Text style={styles.stepDetail}>{lang === "gu" ? s.detail_gu : s.detail_en}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Expert banner */}
        <Pressable
          testID="expert-banner"
          style={styles.expertBanner}
          onPress={() => router.push("/(tabs)/expert")}
        >
          <View style={styles.expertIconWrap}>
            <Ionicons name="headset" size={26} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.expertTitle}>{t(lang, "expert_banner_title")}</Text>
            <Text style={styles.expertPrice}>{t(lang, "expert_banner_price")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#FFF" />
        </Pressable>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  brand: { fontSize: typeScale.xxl, fontWeight: "800", color: colors.onSurface },
  brandSub: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  sectionLabel: { fontSize: typeScale.lg, fontWeight: "700", color: colors.onSurface },
  sectionHint: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary, marginBottom: spacing.xs },
  baseRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  baseChip: {
    flexBasis: "48%",
    flexGrow: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    minHeight: 60,
    justifyContent: "center",
  },
  baseChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  baseChipText: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary, fontWeight: "600", textAlign: "center" },
  baseChipTextActive: { color: colors.brand },
  toggleCard: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
  },
  toggleTitle: { fontSize: typeScale.base, fontWeight: "700", color: colors.onSurface },
  toggleHint: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  noticeCard: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: "#FFF7E6",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#FFE0A3",
  },
  noticeText: { flex: 1, color: "#7A4F00", fontSize: typeScale.sm },
  h2: { fontSize: typeScale.lg, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  docCard: {
    width: "48%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  docIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: { fontSize: typeScale.base, fontWeight: "700", color: colors.onSurface },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  pillMatch: { backgroundColor: "#E6F4EA" },
  pillMismatch: { backgroundColor: "#FDECEA" },
  pillPending: { backgroundColor: "#FFF4E0" },
  pillText: { fontSize: typeScale.sm, color: colors.onSurface, fontWeight: "600" },
  roadmapWrap: { gap: 0, marginTop: spacing.sm },
  stepRow: { flexDirection: "row", gap: spacing.md },
  stepLeft: { width: 28, alignItems: "center" },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  stepDotText: { color: "#FFF", fontWeight: "800", fontSize: typeScale.sm },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.brandTertiary, marginTop: 4, marginBottom: 4 },
  stepBody: { flex: 1, paddingBottom: spacing.lg, gap: spacing.xs },
  stepTitle: { fontSize: typeScale.base, fontWeight: "700", color: colors.onSurface },
  stepDetail: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary, lineHeight: 20 },
  expertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  expertIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  expertTitle: { color: "#FFF", fontSize: typeScale.base, fontWeight: "700", marginBottom: 2 },
  expertPrice: { color: "#E8F0EA", fontSize: typeScale.sm, fontWeight: "600" },
});
