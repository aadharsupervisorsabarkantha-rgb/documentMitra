import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useApp } from "@/src/store";
import { t } from "@/src/i18n";
import { colors, radius, spacing, typeScale } from "@/src/theme";

export default function Login() {
  const { api, setToken, lang } = useApp();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sendOtp = async () => {
    const clean = phone.replace(/[^0-9+]/g, "");
    if (clean.length < 10) {
      setErr(t(lang, "missing_phone"));
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await api("/api/auth/request-otp", { method: "POST", body: JSON.stringify({ phone: clean }) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setStep("otp");
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (otp.trim().length !== 6) {
      setErr(t(lang, "missing_otp"));
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const clean = phone.replace(/[^0-9+]/g, "");
      const res = await api<{ token: string; phone: string }>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: clean, otp: otp.trim(), language: lang }),
      });
      await setToken(res.token, res.phone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Pressable testID="login-back-btn" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={42} color={colors.brand} />
          </View>
          <Text style={styles.title}>{t(lang, "login_title")}</Text>
          <Text style={styles.sub}>{t(lang, "login_sub")}</Text>

          {step === "phone" ? (
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>{t(lang, "phone_label")}</Text>
              <TextInput
                testID="phone-input"
                style={styles.input}
                placeholder={t(lang, "phone_ph")}
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={15}
              />
            </View>
          ) : (
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>{t(lang, "enter_otp")}</Text>
              <TextInput
                testID="otp-input"
                style={styles.input}
                placeholder={t(lang, "otp_ph")}
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={6}
              />
              <Pressable onPress={() => { setStep("phone"); setOtp(""); }} hitSlop={10}>
                <Text style={styles.changeBtn}>{t(lang, "change_number")}</Text>
              </Pressable>
            </View>
          )}

          {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            testID={step === "phone" ? "send-otp-btn" : "verify-otp-btn"}
            style={({ pressed }) => [styles.cta, (pressed || loading) && { opacity: 0.85 }]}
            onPress={step === "phone" ? sendOtp : verify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.ctaText}>{step === "phone" ? t(lang, "send_otp") : t(lang, "verify")}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  body: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.md },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { fontSize: typeScale.xxl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: typeScale.base, color: colors.onSurfaceTertiary, lineHeight: 22 },
  fieldWrap: { marginTop: spacing.lg, gap: spacing.sm },
  label: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: typeScale.lg,
    color: colors.onSurface,
  },
  changeBtn: { marginTop: spacing.sm, color: colors.brand, fontWeight: "600" },
  err: { color: colors.error, marginTop: spacing.md, fontSize: typeScale.base },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, paddingTop: spacing.md },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: typeScale.lg },
});
