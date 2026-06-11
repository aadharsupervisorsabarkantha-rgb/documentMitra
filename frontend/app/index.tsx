import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useApp } from "@/src/store";
import { t } from "@/src/i18n";
import { colors, radius, spacing, typeScale } from "@/src/theme";

const BG = "https://images.unsplash.com/photo-1723871568744-6f3733c152bd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTB8MHwxfHNlYXJjaHwxfHxndWphcmF0JTIwbGFuZHNjYXBlJTIwbGFuZG1hcmslMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc4MTA5NzQ5OHww&ixlib=rb-4.1.0&q=85";

export default function Index() {
  const { ready, token, setLang, lang } = useApp();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    // If a language was previously chosen (stored), skip directly
    if (ready) setPicked(false);
  }, [ready]);

  if (!ready) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (token) return <Redirect href="/(tabs)" />;
  if (picked) return <Redirect href="/login" />;

  const onPick = async (l: "en" | "gu") => {
    if (selecting) return;
    setSelecting(true);
    Haptics.selectionAsync().catch(() => {});
    await setLang(l);
    setPicked(true);
  };

  return (
    <ImageBackground source={{ uri: BG }} style={styles.bg} resizeMode="cover">
      <LinearGradient
        colors={["rgba(28,28,26,0.0)", "rgba(28,28,26,0.55)", "rgba(28,28,26,0.92)"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.top}>
          <Text style={styles.brand} testID="welcome-brand">{t(lang, "app_name")}</Text>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.title}>{t(lang, "choose_language")}</Text>
          <Text style={styles.subtitle}>{t(lang, "app_tagline")}</Text>
          <Pressable
            testID="lang-en-btn"
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => onPick("en")}
          >
            <Text style={styles.ctaText}>Continue in English</Text>
          </Pressable>
          <Pressable
            testID="lang-gu-btn"
            style={({ pressed }) => [styles.ctaAlt, pressed && styles.ctaPressed]}
            onPress={() => onPick("gu")}
          >
            <Text style={styles.ctaAltText}>ગુજરાતી માં ચાલુ રાખો</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  bg: { flex: 1 },
  safe: { flex: 1, justifyContent: "space-between", paddingHorizontal: spacing.xl },
  top: { paddingTop: spacing.xl },
  brand: { color: "#FFF", fontSize: typeScale.xxl, fontWeight: "700", letterSpacing: 0.5 },
  bottom: { paddingBottom: spacing.xl, gap: spacing.md },
  title: { color: "#FFF", fontSize: typeScale.xxxl, fontWeight: "800" },
  subtitle: { color: "#E5E5E0", fontSize: typeScale.lg, marginBottom: spacing.lg, lineHeight: 24 },
  cta: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  ctaText: { color: colors.onBrand, fontSize: typeScale.lg, fontWeight: "700" },
  ctaAlt: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  ctaAltText: { color: "#FFF", fontSize: typeScale.lg, fontWeight: "700" },
  ctaPressed: { opacity: 0.8 },
});
