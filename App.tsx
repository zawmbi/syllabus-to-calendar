import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { appConfig, hasGoogleExport, hasLiveParsing, hasNotionExport } from "./src/config";
import {
  beginGoogleExport,
  beginNotionExport,
  exportToDeviceCalendar,
} from "./src/services/exporters";
import { parseSyllabus } from "./src/services/parser";
import type { ExportTarget, ImportedFile, ParsedItem } from "./src/types";

const palette = {
  background: "#F5F0E6",
  surface: "#FBF7F0",
  surfaceMuted: "#EFE6D7",
  border: "#E2D7C3",
  text: "#315F57",
  textSoft: "#6F857F",
  sage: "#A8B88A",
  forest: "#366D61",
  olive: "#6D8B70",
  accent: "#D8C48F",
  blush: "#EDE3D3",
};

const exportTargets: ExportTarget[] = [
  "Google Calendar",
  "Apple Calendar",
  "Notion",
];

const sansFont = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif-medium",
  default: "System",
});

function inferTypeLabel(name?: string, mimeType?: string | null) {
  if (mimeType?.includes("pdf") || name?.toLowerCase().endsWith(".pdf")) {
    return "PDF";
  }

  if (mimeType?.includes("heic") || name?.toLowerCase().endsWith(".heic")) {
    return "HEIC";
  }

  if (
    mimeType?.includes("jpeg") ||
    mimeType?.includes("jpg") ||
    name?.toLowerCase().endsWith(".jpg") ||
    name?.toLowerCase().endsWith(".jpeg")
  ) {
    return "JPEG";
  }

  return "Photo";
}

function formatDisplayDate(rawDate: string) {
  const date = new Date(`${rawDate}T12:00:00`);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function AppContent() {
  const [fontsLoaded] = useFonts({
    Alice: require("./Alice/Alice-Regular.ttf"),
  });
  const [selectedTarget, setSelectedTarget] =
    useState<ExportTarget>("Google Calendar");
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [parseMode, setParseMode] = useState<"demo" | "live" | null>(null);

  const integrationSummary = useMemo(
    () => [
      hasLiveParsing() ? "Live parsing API connected" : "Demo parsing mode",
      hasGoogleExport() ? "Google export endpoint ready" : "Google opens event draft",
      "Apple/Android device calendar export enabled",
      hasNotionExport() ? "Notion export endpoint ready" : "Notion awaits backend connection",
    ],
    [],
  );

  const applyImportedFile = (file: ImportedFile) => {
    setImportedFile(file);
    setParsedItems([]);
    setParseMode(null);
  };

  const handlePickDocument = async () => {
    setIsImporting(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/heic", "image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        applyImportedFile({
          name: asset.name || "Syllabus import",
          typeLabel: inferTypeLabel(asset.name, asset.mimeType),
          source: "document",
          uri: asset.uri,
          mimeType: asset.mimeType,
        });
      }
    } catch {
      Alert.alert("Import failed", "Please try selecting your syllabus again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handlePickPhoto = async () => {
    setIsImporting(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Photo access needed",
          "Allow photo access to import a scanned syllabus image.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const fileName = asset.fileName || "Scanned syllabus";
        applyImportedFile({
          name: fileName,
          typeLabel: inferTypeLabel(fileName, asset.mimeType),
          source: "photo",
          uri: asset.uri,
          mimeType: asset.mimeType,
        });
      }
    } catch {
      Alert.alert("Photo import failed", "Please try choosing a photo again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleParse = async () => {
    if (!importedFile) {
      Alert.alert("No syllabus selected", "Choose a file or photo first.");
      return;
    }

    setIsParsing(true);

    try {
      const result = await parseSyllabus(importedFile);
      setParsedItems(result.items);
      setParseMode(result.mode);
    } catch {
      Alert.alert("Parse failed", "We could not analyze this syllabus yet.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleExport = async (target: ExportTarget) => {
    setSelectedTarget(target);

    if (!parsedItems.length) {
      Alert.alert(
        "Parse first",
        "Analyze the syllabus first so there are actual events to export.",
      );
      return;
    }

    setIsExporting(true);

    try {
      if (target === "Apple Calendar") {
        await exportToDeviceCalendar(parsedItems);
        Alert.alert(
          "Calendar updated",
          `Added ${parsedItems.length} items to your device calendar.`,
        );
      } else if (target === "Google Calendar") {
        await beginGoogleExport(parsedItems);
        Alert.alert(
          "Google Calendar",
          hasGoogleExport()
            ? "Opening the connected Google export flow."
            : "Opening a Google Calendar event draft. Add a backend to create all events automatically.",
        );
      } else {
        await beginNotionExport(parsedItems);
        Alert.alert(
          "Notion export",
          "Sent parsed syllabus items to your Notion export endpoint.",
        );
      }
    } catch (error) {
      const fallbackMessage =
        target === "Notion"
          ? "Connect a Notion export endpoint first."
          : "Please try the export again.";

      Alert.alert(
        `${target} export`,
        error instanceof Error ? error.message : fallbackMessage,
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (!fontsLoaded) {
    return <View style={styles.loadingScreen} />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />

          <View style={styles.contentColumn}>
            <Text style={styles.eyebrow}>Syllabus planner</Text>
            <Text style={styles.heroTitle}>
              Turn any syllabus into a calm, organized semester.
            </Text>
            <Text style={styles.heroBody}>
              Import a PDF, JPEG, HEIC, or photo scan, extract important dates,
              homework, and exams, then send them into Google Calendar, Apple
              Calendar, or Notion.
            </Text>

            <View style={styles.uploadCard}>
              <View style={styles.uploadHeaderRow}>
                <View style={styles.uploadHeaderText}>
                  <Text style={styles.cardTitle}>Import your syllabus</Text>
                  <Text style={styles.cardBody}>
                    Designed for iOS and Android with a cleaner, centered flow.
                  </Text>
                </View>
                <View style={styles.fileBadge}>
                  <Text style={styles.fileBadgeText}>4 formats</Text>
                </View>
              </View>

              <View style={styles.dropZone}>
                <View style={styles.dropIcon}>
                  <View style={styles.dropIconInner} />
                </View>
                <Text style={styles.dropZoneTitle}>
                  {importedFile ? "Syllabus ready to analyze" : "Choose how to import"}
                </Text>
                <Text style={styles.dropZoneBody}>
                  {importedFile
                    ? `${importedFile.name} imported from ${importedFile.source === "photo" ? "Photos" : "Files"} as ${importedFile.typeLabel}.`
                    : "Start with a document or a photo. Then we can pull out semester dates into structured events."}
                </Text>

                <View style={styles.buttonRow}>
                  <Pressable
                    onPress={handlePickDocument}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isImporting ? "Importing..." : "Choose file"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handlePickPhoto}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Choose photo</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleParse}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      styles.parseButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {isParsing ? "Analyzing..." : "Analyze syllabus"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {importedFile ? (
                <View style={styles.selectionCard}>
                  <Text style={styles.sectionLabel}>Imported syllabus</Text>
                  <Text style={styles.selectionTitle}>{importedFile.name}</Text>
                  <Text style={styles.selectionMeta}>
                    {importedFile.typeLabel} • {parseMode === "live" ? "Live parsing" : "Waiting to analyze"}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.grid}>
              <View style={[styles.infoCard, styles.tallCard]}>
                <Text style={styles.sectionLabel}>Extraction results</Text>
                <Text style={styles.infoTitle}>
                  Important dates, homework, and exams
                </Text>
                <Text style={styles.cardBody}>
                  The app keeps routine syllabus clutter from overwhelming the
                  high-value dates you actually need to see.
                </Text>

                <View style={styles.heatmap}>
                  {[
                    palette.blush,
                    palette.blush,
                    palette.blush,
                    palette.sage,
                    palette.forest,
                    palette.blush,
                    palette.olive,
                    palette.blush,
                    palette.accent,
                    palette.forest,
                    palette.blush,
                    palette.sage,
                  ].map((color, index) => (
                    <View
                      key={index}
                      style={[styles.heatCell, { backgroundColor: color }]}
                    />
                  ))}
                </View>

                {parsedItems.length ? (
                  <View style={styles.parsedList}>
                    {parsedItems.map((item) => (
                      <View key={`${item.title}-${item.date}`} style={styles.parsedRow}>
                        <Text style={styles.parsedTitle}>{item.title}</Text>
                        <Text style={styles.parsedMeta}>
                          {item.type} • {formatDisplayDate(item.date)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyStateText}>
                    Analyze a syllabus to generate structured items here.
                  </Text>
                )}
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.sectionLabel}>Connections</Text>
                <Text style={styles.infoTitle}>Google, Apple, or Notion</Text>
                <Text style={styles.cardBody}>
                  Apple export works directly on-device now. Google and Notion
                  are wired for backend connection endpoints.
                </Text>
                <View style={styles.chipRow}>
                  {exportTargets.map((target) => {
                    const isSelected = target === selectedTarget;

                    return (
                      <Pressable
                        key={target}
                        onPress={() => handleExport(target)}
                        style={[
                          styles.chip,
                          isSelected && styles.chipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            isSelected && styles.chipTextActive,
                          ]}
                        >
                          {isExporting && isSelected ? "Working..." : target}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.sectionLabel}>Production mode</Text>
                <Text style={styles.infoTitle}>What is connected right now</Text>
                <View style={styles.checkList}>
                  {integrationSummary.map((item) => (
                    <Text key={item} style={styles.checkListItem}>
                      {item}
                    </Text>
                  ))}
                </View>
                {appConfig.parseApiBaseUrl ? (
                  <Text style={styles.endpointText}>
                    Parse API: {appConfig.parseApiBaseUrl}
                  </Text>
                ) : null}
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.sectionLabel}>Coming next</Text>
                <Text style={styles.infoTitle}>Attendance tracker connection</Text>
                <Text style={styles.cardBody}>
                  The next layer can merge class attendance with deadlines so
                  riskier weeks become visible early.
                </Text>
                <View style={styles.timeline}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineLine} />
                  <View style={[styles.timelineDot, styles.timelineDotActive]} />
                </View>
              </View>
            </View>

            <View style={styles.bottomCard}>
              <Text style={styles.sectionLabel}>Simple flow</Text>
              <Text style={styles.bottomTitle}>
                Import, analyze, and export without rebuilding your semester by hand
              </Text>
              <Text style={styles.cardBody}>
                This starter now has real import behavior, a live-ready parsing
                hook, real device calendar export, and production slots for
                Google Calendar and Notion integrations.
              </Text>
              <Text style={styles.bottomFootnote}>
                Parsing mode: {parseMode === "live" ? "Live API" : "Demo fallback"}
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return <AppContent />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    alignItems: "center",
  },
  contentColumn: {
    width: "100%",
    maxWidth: 560,
    alignItems: "center",
    gap: 18,
  },
  heroGlowOne: {
    position: "absolute",
    top: 8,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: "rgba(216, 196, 143, 0.16)",
  },
  heroGlowTwo: {
    position: "absolute",
    top: 120,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: "rgba(168, 184, 138, 0.12)",
  },
  eyebrow: {
    marginTop: 10,
    color: palette.textSoft,
    textTransform: "uppercase",
    letterSpacing: 3,
    fontSize: 12,
    fontFamily: sansFont,
    textAlign: "center",
  },
  heroTitle: {
    color: palette.text,
    fontSize: 42,
    lineHeight: 48,
    fontFamily: "Alice",
    maxWidth: 420,
    textAlign: "center",
  },
  heroBody: {
    color: palette.textSoft,
    fontSize: 18,
    lineHeight: 29,
    fontFamily: sansFont,
    maxWidth: 430,
    textAlign: "center",
  },
  uploadCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 18,
    shadowColor: "#45533F",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    alignItems: "center",
  },
  uploadHeaderRow: {
    width: "100%",
    justifyContent: "center",
    gap: 16,
    alignItems: "center",
  },
  uploadHeaderText: {
    gap: 8,
    alignItems: "center",
  },
  cardTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 30,
    lineHeight: 34,
    textAlign: "center",
  },
  cardBody: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 17,
    lineHeight: 28,
    textAlign: "center",
  },
  fileBadge: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fileBadgeText: {
    color: palette.forest,
    fontFamily: sansFont,
    fontSize: 13,
  },
  dropZone: {
    width: "100%",
    backgroundColor: "#F7F1E8",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    borderStyle: "dashed",
    padding: 22,
    alignItems: "center",
    gap: 12,
  },
  dropIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(54, 109, 97, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  dropIconInner: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: palette.forest,
  },
  dropZoneTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 26,
    lineHeight: 30,
    textAlign: "center",
  },
  dropZoneBody: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 16,
    lineHeight: 25,
    textAlign: "center",
    maxWidth: 420,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: palette.forest,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonText: {
    color: "#F9F5EE",
    fontFamily: sansFont,
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#F6F0E5",
  },
  parseButton: {
    backgroundColor: palette.surfaceMuted,
  },
  secondaryButtonPressed: {
    opacity: 0.86,
  },
  secondaryButtonText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 16,
  },
  selectionCard: {
    width: "100%",
    backgroundColor: "rgba(239, 230, 215, 0.55)",
    borderRadius: 20,
    padding: 16,
    gap: 6,
    alignItems: "center",
  },
  selectionTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 23,
    lineHeight: 28,
    textAlign: "center",
  },
  selectionMeta: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 15,
    textAlign: "center",
  },
  grid: {
    width: "100%",
    gap: 16,
  },
  infoCard: {
    width: "100%",
    backgroundColor: "rgba(251, 247, 240, 0.88)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    gap: 14,
    alignItems: "center",
  },
  tallCard: {
    paddingBottom: 24,
  },
  sectionLabel: {
    color: palette.textSoft,
    textTransform: "uppercase",
    letterSpacing: 2.8,
    fontSize: 12,
    fontFamily: sansFont,
    textAlign: "center",
  },
  infoTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 28,
    lineHeight: 33,
    textAlign: "center",
  },
  heatmap: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  heatCell: {
    width: 36,
    height: 36,
    borderRadius: 12,
  },
  parsedList: {
    width: "100%",
    marginTop: 4,
    gap: 10,
  },
  parsedRow: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#F7F0E6",
    gap: 4,
  },
  parsedTitle: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 16,
    textAlign: "center",
  },
  parsedMeta: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  emptyStateText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 15,
    textAlign: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  chip: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: palette.forest,
  },
  chipText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
  },
  chipTextActive: {
    color: "#F9F5EE",
  },
  checkList: {
    gap: 8,
    alignItems: "center",
  },
  checkListItem: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 15,
    textAlign: "center",
  },
  endpointText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  timeline: {
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: palette.accent,
  },
  timelineDotActive: {
    backgroundColor: palette.forest,
  },
  timelineLine: {
    flex: 1,
    height: 2,
    backgroundColor: palette.border,
  },
  bottomCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 22,
    gap: 14,
    marginTop: 4,
    alignItems: "center",
  },
  bottomTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 31,
    lineHeight: 36,
    maxWidth: 420,
    textAlign: "center",
  },
  bottomFootnote: {
    color: palette.forest,
    fontFamily: sansFont,
    fontSize: 15,
    textAlign: "center",
  },
});
