import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";

import { useApp } from "@/src/store";
import { t, Lang, StringKey } from "@/src/i18n";
import { colors, radius, spacing, typeScale } from "@/src/theme";

const VALID = new Set(["aadhaar", "pan", "voter_id", "passport", "birth", "lc", "husband_aadhaar", "father_aadhaar", "mother_aadhaar"]);

type OcrOut = {
  detected_type: string;
  type_match: boolean;
  error_message?: string | null;
  fields: {
    name?: string | null;
    dob?: string | null;
    doc_number?: string | null;
    father_name?: string | null;
    mother_name?: string | null;
    surname?: string | null;
    first_name?: string | null;
  };
};

export default function ScanScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const router = useRouter();
  const { api, lang, documents, refresh } = useApp();
  const docType = String(params.doc || "");
  const valid = VALID.has(docType);
  const isLC = docType === "lc";

  const existing = documents.find((d) => d.doc_type === docType);
  const [mode, setMode] = useState<"menu" | "camera" | "form">(existing || isLC ? "form" : "menu");
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [processing, setProcessing] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [name, setName] = useState(existing?.name || "");
  const [firstName, setFirstName] = useState(existing?.first_name || "");
  const [surname, setSurname] = useState(existing?.surname || "");
  const [dob, setDob] = useState(existing?.dob || "");
  const [docNumber, setDocNumber] = useState(existing?.doc_number || "");
  const [fatherName, setFatherName] = useState(existing?.father_name || "");
  const [motherName, setMotherName] = useState(existing?.mother_name || "");
  const [saving, setSaving] = useState(false);
  const [inputMode, setInputMode] = useState<"manual" | "camera" | "gallery">(
    (existing?.mode as any) || "manual",
  );

  useEffect(() => {
    if (!valid) router.back();
  }, [valid, router]);

  const fillFromOcr = (out: OcrOut) => {
    if (!out.type_match) {
      setTopError(out.error_message || t(lang, "doc_type_mismatch_default"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setTopError(null);
    const f = out.fields;
    if (f.name) setName(f.name);
    if (f.first_name) setFirstName(f.first_name);
    if (f.surname) setSurname(f.surname);
    if (f.dob) setDob(f.dob);
    if (f.doc_number) setDocNumber(f.doc_number);
    if (f.father_name) setFatherName(f.father_name);
    if (f.mother_name) setMotherName(f.mother_name);
    setMode("form");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const runOcr = async (image_base64: string, sourceMode: "camera" | "gallery") => {
    setProcessing(true);
    setTopError(null);
    try {
      const out = await api<OcrOut>("/api/ocr/extract", {
        method: "POST",
        body: JSON.stringify({ image_base64, expected_doc_type: docType }),
      });
      setInputMode(sourceMode);
      fillFromOcr(out);
    } catch (e: any) {
      setTopError(e.message || t(lang, "read_failed"));
      setMode("form");
    } finally {
      setProcessing(false);
    }
  };

  const onPickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.7,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    await runOcr(res.assets[0].base64, "gallery");
  };

  const onOpenCamera = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) return;
    }
    setMode("camera");
  };

  const onCapture = async () => {
    if (!cameraRef.current) return;
    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7, skipProcessing: false });
      if (photo?.base64) {
        await runOcr(photo.base64, "camera");
      }
    } catch (e) {
      setTopError(t(lang, "read_failed"));
      setMode("form");
    } finally {
      setProcessing(false);
    }
  };

  const onManual = () => {
    setInputMode("manual");
    setMode("form");
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await api("/api/documents", {
        method: "POST",
        body: JSON.stringify({
          doc_type: docType,
          name: name || null,
          first_name: firstName || null,
          surname: surname || null,
          dob: dob || null,
          doc_number: docNumber || null,
          father_name: fatherName || null,
          mother_name: motherName || null,
          mode: inputMode,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await refresh();
      router.back();
    } catch (e: any) {
      setTopError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setSaving(true);
    try {
      await api(`/api/documents/${docType}`, { method: "DELETE" });
      await refresh();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="scan-back-btn" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {t(lang, docType as StringKey)}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {topError ? (
        <View style={styles.errorBanner} testID="ocr-error-banner">
          <Ionicons name="warning" size={20} color={colors.error} />
          <Text style={styles.errorText}>{topError}</Text>
        </View>
      ) : null}

      {isLC ? (
        <View style={styles.warnBanner} testID="lc-manual-warning">
          <Ionicons name="information-circle" size={20} color="#7A4F00" />
          <Text style={styles.warnText}>{t(lang, "lc_manual_warning")}</Text>
        </View>
      ) : null}

      {mode === "menu" ? (
        <ScrollView contentContainerStyle={styles.menu}>
          <Text style={styles.menuHint}>{t(lang, "scan_title")}</Text>
          <Pressable testID="opt-camera-btn" style={styles.optPrimary} onPress={onOpenCamera}>
            <Ionicons name="camera" size={22} color="#FFF" />
            <Text style={styles.optPrimaryText}>{t(lang, "camera_scan")}</Text>
          </Pressable>
          <Pressable testID="opt-gallery-btn" style={styles.optSecondary} onPress={onPickGallery}>
            <Ionicons name="images" size={22} color={colors.brand} />
            <Text style={styles.optSecondaryText}>{t(lang, "gallery_upload")}</Text>
          </Pressable>
          <Pressable testID="opt-manual-btn" style={styles.optTertiary} onPress={onManual}>
            <Ionicons name="create" size={20} color={colors.brand} />
            <Text style={styles.optTertiaryText}>{t(lang, "manual_entry")}</Text>
          </Pressable>
          {processing ? (
            <View style={styles.processing}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.processingText}>{t(lang, "processing")}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : mode === "camera" ? (
        <View style={{ flex: 1 }}>
          {permission?.granted ? (
            <CameraView ref={cameraRef as any} style={{ flex: 1 }} facing="back">
              <View style={styles.camOverlay}>
                <View style={styles.camFrame} />
              </View>
            </CameraView>
          ) : (
            <View style={styles.permWrap}>
              <Text style={styles.permText}>{t(lang, "permission_camera")}</Text>
              <Pressable style={styles.optPrimary} onPress={requestPermission}>
                <Text style={styles.optPrimaryText}>{t(lang, "grant_permission")}</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.camFooter}>
            <Pressable testID="cam-cancel-btn" onPress={() => setMode("menu")} style={styles.camCancel}>
              <Text style={styles.camCancelText}>{t(lang, "cancel")}</Text>
            </Pressable>
            <Pressable testID="cam-capture-btn" onPress={onCapture} style={styles.camShutter} disabled={processing}>
              {processing ? <ActivityIndicator color="#FFF" /> : <View style={styles.camShutterInner} />}
            </Pressable>
            <View style={{ width: 60 }} />
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Field label={t(lang, "name")} value={name} onChangeText={setName} testID="field-name" />
            {docType === "husband_aadhaar" ? (
              <>
                <Field label={t(lang, "first_name")} value={firstName} onChangeText={setFirstName} testID="field-first-name" />
                <Field label={t(lang, "surname")} value={surname} onChangeText={setSurname} testID="field-surname" />
              </>
            ) : null}
            <Field label={t(lang, "dob")} value={dob} onChangeText={setDob} placeholder="DD/MM/YYYY" testID="field-dob" />
            <Field label={t(lang, "doc_number")} value={docNumber} onChangeText={setDocNumber} testID="field-doc-number" />
            {(docType === "birth" || docType === "lc") ? (
              <>
                <Field label={t(lang, "father_name")} value={fatherName} onChangeText={setFatherName} testID="field-father-name" />
                <Field label={t(lang, "mother_name")} value={motherName} onChangeText={setMotherName} testID="field-mother-name" />
              </>
            ) : null}
            <Pressable
              testID="rescan-btn"
              onPress={() => setMode("menu")}
              style={[styles.optTertiary, { marginTop: spacing.sm }, isLC && { display: "none" }]}
            >
              <Ionicons name="refresh" size={18} color={colors.brand} />
              <Text style={styles.optTertiaryText}>
                {lang === "gu" ? "ફરી સ્કેન / અપલોડ કરો" : "Scan / upload again"}
              </Text>
            </Pressable>
            <View style={{ height: 100 }} />
          </ScrollView>
          <View style={styles.footer}>
            {existing ? (
              <Pressable testID="delete-btn" style={styles.deleteBtn} onPress={onDelete} disabled={saving}>
                <Ionicons name="trash" size={18} color={colors.error} />
                <Text style={styles.deleteText}>{t(lang, "delete")}</Text>
              </Pressable>
            ) : null}
            <Pressable testID="save-btn" style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={onSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>{t(lang, "save")}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Field({
  label, value, onChangeText, placeholder, testID,
}: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string; testID?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: typeScale.lg, fontWeight: "800", color: colors.onSurface, flex: 1, textAlign: "center" },
  errorBanner: {
    margin: spacing.lg, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: "#FDECEA", borderColor: colors.error, borderWidth: 1,
    flexDirection: "row", gap: spacing.sm, alignItems: "flex-start",
  },
  errorText: { color: colors.error, flex: 1, fontWeight: "600" },
  warnBanner: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: "#FFF7E6", borderColor: "#FFE0A3", borderWidth: 1,
    flexDirection: "row", gap: spacing.sm, alignItems: "flex-start",
  },
  warnText: { color: "#7A4F00", flex: 1, fontWeight: "600", lineHeight: 20 },
  menu: { padding: spacing.lg, gap: spacing.md },
  menuHint: { fontSize: typeScale.base, color: colors.onSurfaceTertiary },
  optPrimary: {
    backgroundColor: colors.brand, paddingVertical: spacing.lg, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  optPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: typeScale.lg },
  optSecondary: {
    backgroundColor: colors.brandTertiary, paddingVertical: spacing.lg, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
  },
  optSecondaryText: { color: colors.brand, fontWeight: "700", fontSize: typeScale.lg },
  optTertiary: {
    paddingVertical: spacing.md, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  optTertiaryText: { color: colors.brand, fontWeight: "700", fontSize: typeScale.base },
  processing: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md },
  processingText: { color: colors.onSurfaceTertiary },
  camOverlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  camFrame: {
    width: "85%", aspectRatio: 1.6, borderWidth: 2, borderColor: "#FFF",
    borderRadius: radius.md, backgroundColor: "rgba(0,0,0,0.0)",
  },
  camFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: spacing.lg, backgroundColor: "#000",
  },
  camCancel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, width: 60 },
  camCancelText: { color: "#FFF" },
  camShutter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#FFF",
    alignItems: "center", justifyContent: "center",
  },
  camShutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFF" },
  permWrap: { flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  permText: { color: colors.onSurface, textAlign: "center", fontSize: typeScale.base },
  form: { padding: spacing.lg, gap: spacing.md },
  field: { gap: spacing.xs },
  fieldLabel: { fontSize: typeScale.sm, color: colors.onSurfaceTertiary, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    fontSize: typeScale.lg, color: colors.onSurface,
  },
  footer: {
    flexDirection: "row", gap: spacing.sm,
    padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  deleteBtn: {
    flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error, backgroundColor: "#FDECEA",
  },
  deleteText: { color: colors.error, fontWeight: "700" },
  saveBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingVertical: spacing.lg, alignItems: "center",
  },
  saveText: { color: "#FFF", fontWeight: "700", fontSize: typeScale.lg },
});
