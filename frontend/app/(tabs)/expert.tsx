import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useApp } from "@/src/store";
import { t } from "@/src/i18n";
import { colors, radius, spacing, typeScale } from "@/src/theme";

type SlotGroup = { date_label: string; slots: { time_label: string; slot_iso: string }[] };
type Booking = { id: string; slot_iso: string; mode: string; status: string; amount_inr: number };

export default function ExpertTab() {
  const { api, lang } = useApp();
  const [slots, setSlots] = useState<SlotGroup[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mode, setMode] = useState<"audio" | "video">("audio");
  const [picked, setPicked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [success, setSuccess] = useState<{ whatsapp: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        api<{ slots: SlotGroup[] }>("/api/expert/slots"),
        api<{ bookings: Booking[] }>("/api/expert/bookings"),
      ]);
      setSlots(s.slots);
      setBookings(b.bookings);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
      setSuccess(null);
    }, [load]),
  );

  const book = async () => {
    if (!picked) return;
    setBooking(true);
    try {
      const res = await api<{ whatsapp_link: string }>("/api/expert/book", {
        method: "POST",
        body: JSON.stringify({ slot_iso: picked, mode, note: "Booked via app" }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuccess({ whatsapp: res.whatsapp_link });
      setPicked(null);
      load();
    } catch (e: any) {
      console.warn(e);
    } finally {
      setBooking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(lang, "expert")}</Text>
        <Text style={styles.sub}>{t(lang, "expert_banner_title")}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Mode selector */}
        <View style={styles.modeRow}>
          <Pressable
            testID="mode-audio-btn"
            style={[styles.modeChip, mode === "audio" && styles.modeChipActive]}
            onPress={() => setMode("audio")}
          >
            <Ionicons name="call" size={18} color={mode === "audio" ? colors.brand : colors.muted} />
            <Text style={[styles.modeText, mode === "audio" && styles.modeTextActive]}>{t(lang, "audio_call")}</Text>
          </Pressable>
          <Pressable
            testID="mode-video-btn"
            style={[styles.modeChip, mode === "video" && styles.modeChipActive]}
            onPress={() => setMode("video")}
          >
            <Ionicons name="videocam" size={18} color={mode === "video" ? colors.brand : colors.muted} />
            <Text style={[styles.modeText, mode === "video" && styles.modeTextActive]}>{t(lang, "video_call")}</Text>
          </Pressable>
        </View>

        <Text style={styles.h2}>{t(lang, "pick_slot")}</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          slots.map((g) => (
            <View key={g.date_label} style={{ marginBottom: spacing.md }}>
              <Text style={styles.dateLabel}>{g.date_label}</Text>
              <View style={styles.slotsRow}>
                {g.slots.map((s) => {
                  const active = picked === s.slot_iso;
                  return (
                    <Pressable
                      key={s.slot_iso}
                      testID={`slot-${s.slot_iso}`}
                      style={[styles.slotChip, active && styles.slotChipActive]}
                      onPress={() => setPicked(s.slot_iso)}
                    >
                      <Text style={[styles.slotText, active && styles.slotTextActive]}>{s.time_label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {success ? (
          <View style={styles.successCard} testID="booking-success">
            <Ionicons name="checkmark-circle" size={28} color={colors.success} />
            <Text style={styles.successText}>{t(lang, "booking_success")}</Text>
            <Pressable
              testID="open-whatsapp-btn"
              style={styles.whatsBtn}
              onPress={() => Linking.openURL(success.whatsapp).catch(() => {})}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#FFF" />
              <Text style={styles.whatsBtnText}>WhatsApp</Text>
            </Pressable>
          </View>
        ) : null}

        {bookings.length > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.h2}>{t(lang, "bookings")}</Text>
            {bookings.map((b) => (
              <View key={b.id} style={styles.bookingRow}>
                <Ionicons name="checkmark-done-circle" size={22} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookingTitle}>{b.mode === "audio" ? t(lang, "audio_call") : t(lang, "video_call")}</Text>
                  <Text style={styles.bookingSub}>{b.slot_iso.replace("T", " ").slice(0, 16)}</Text>
                </View>
                <Text style={styles.bookingPrice}>₹{b.amount_inr}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="pay-book-btn"
          style={[styles.cta, (!picked || booking) && { opacity: 0.5 }]}
          onPress={book}
          disabled={!picked || booking}
        >
          {booking ? <ActivityIndicator color="#FFF" /> : <Text style={styles.ctaText}>{t(lang, "pay_and_book")}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  title: { fontSize: typeScale.xxl, fontWeight: "800", color: colors.onSurface },
  sub: { color: colors.onSurfaceTertiary, marginTop: 4 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.md },
  modeChip: {
    flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  modeChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  modeText: { fontSize: typeScale.base, color: colors.onSurfaceTertiary, fontWeight: "600" },
  modeTextActive: { color: colors.brand },
  h2: { fontSize: typeScale.lg, fontWeight: "700", color: colors.onSurface, marginVertical: spacing.sm },
  dateLabel: { fontSize: typeScale.base, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.xs },
  slotsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slotChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  slotChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  slotText: { fontSize: typeScale.base, color: colors.onSurface, fontWeight: "600" },
  slotTextActive: { color: "#FFF" },
  successCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    backgroundColor: "#E6F4EA", borderRadius: radius.md, marginTop: spacing.md,
  },
  successText: { flex: 1, color: colors.onSurface, fontSize: typeScale.base, fontWeight: "600" },
  whatsBtn: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: "#25D366", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
  },
  whatsBtnText: { color: "#FFF", fontWeight: "700" },
  bookingRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  bookingTitle: { fontSize: typeScale.base, fontWeight: "700", color: colors.onSurface },
  bookingSub: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary },
  bookingPrice: { fontSize: typeScale.base, fontWeight: "800", color: colors.brand },
  footer: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.lg, alignItems: "center" },
  ctaText: { color: "#FFF", fontWeight: "700", fontSize: typeScale.lg },
});
