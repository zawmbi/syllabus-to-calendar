import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { appConfig, hasGoogleExport, hasLiveParsing, hasNotionExport } from "./src/config";
import {
  beginGoogleExport,
  beginNotionExport,
  exportToDeviceCalendar,
} from "./src/services/exporters";
import {
  beginGoogleOAuth,
  beginNotionOAuth,
  fetchIntegrationStatus,
} from "./src/services/integrations";
import { parseSyllabus } from "./src/services/parser";
import {
  configurePurchases,
  getPremiumStatus,
  purchaseSubscription,
  restoreSubscription,
} from "./src/services/purchases";
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
const roadmapTabs = ["Assignments", "Exams", "Events"] as const;
type RoadmapTab = (typeof roadmapTabs)[number];
const pageTabs = ["Plan", "Help", "Feedback", "Subscribe"] as const;
type PageTab = (typeof pageTabs)[number];

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

function createSessionId() {
  return `session-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function itemMatchesTab(item: ParsedItem, tab: RoadmapTab) {
  if (tab === "Assignments") {
    return item.type === "Homework";
  }

  if (tab === "Exams") {
    return item.type === "Exam";
  }

  return item.type === "Important date";
}

function labelForItemType(itemType: ParsedItem["type"]) {
  if (itemType === "Homework") {
    return "Assignment";
  }

  if (itemType === "Exam") {
    return "Exam";
  }

  return "Event";
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
  const [sessionId] = useState(createSessionId);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionWorkspaceName, setNotionWorkspaceName] = useState<string | null>(null);
  const [isRefreshingConnections, setIsRefreshingConnections] = useState(false);
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [roadmapTab, setRoadmapTab] = useState<RoadmapTab>("Assignments");
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [activePage, setActivePage] = useState<PageTab>("Plan");
  const [feedbackText, setFeedbackText] = useState("");

  const integrationSummary = useMemo(
    () => [
      hasLiveParsing() ? "Live parsing API connected" : "Demo parsing mode",
      googleConnected
        ? "Google connected"
        : hasGoogleExport()
          ? "Google export ready"
          : "Google draft fallback",
      notionConnected
        ? `Notion connected${notionWorkspaceName ? ` to ${notionWorkspaceName}` : ""}`
        : hasNotionExport()
          ? "Notion export ready"
          : "Notion backend needed",
    ],
    [googleConnected, notionConnected, notionWorkspaceName],
  );

  const refreshConnections = async () => {
    setIsRefreshingConnections(true);

    try {
      const status = await fetchIntegrationStatus(sessionId);
      setGoogleConnected(status.googleConnected);
      setNotionConnected(status.notionConnected);
      setNotionWorkspaceName(status.notionWorkspaceName);
    } catch {
      setGoogleConnected(false);
      setNotionConnected(false);
      setNotionWorkspaceName(null);
    } finally {
      setIsRefreshingConnections(false);
    }
  };

  useEffect(() => {
    void refreshConnections();
  }, []);

  useEffect(() => {
    const setupPurchases = async () => {
      try {
        const configured = await configurePurchases(sessionId);

        if (configured) {
          const unlocked = await getPremiumStatus();
          setIsPremiumUnlocked(unlocked);
        }
      } catch {
        setIsPremiumUnlocked(false);
      }
    };

    void setupPurchases();
  }, [sessionId]);

  const applyImportedFile = (file: ImportedFile) => {
    setImportedFile(file);
    setParsedItems([]);
    setParseMode(null);
    setSelectedItemIndex(0);
  };

  const handleUseSampleSyllabus = () => {
    applyImportedFile({
      name: "sample-course-syllabus.pdf",
      typeLabel: "PDF",
      source: "document",
      uri: "demo://sample-syllabus",
      mimeType: "application/pdf",
    });
  };

  const handleUnlockPremium = () => {
    const runPurchase = async () => {
      setIsPurchasing(true);

      try {
        const unlocked = await purchaseSubscription();
        setIsPremiumUnlocked(unlocked);
        Alert.alert(
          unlocked ? "Subscribed" : "Subscription pending",
          unlocked
            ? "Unlimited syllabus uploads are now active."
            : "The purchase did not unlock the entitlement yet.",
        );
      } catch (error) {
        Alert.alert(
          "Purchase failed",
          error instanceof Error ? error.message : "Could not complete the purchase.",
        );
      } finally {
        setIsPurchasing(false);
      }
    };

    void runPurchase();
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
      setSelectedItemIndex(0);
    } catch {
      Alert.alert("Parse failed", "We could not analyze this syllabus yet.");
    } finally {
      setIsParsing(false);
    }
  };

  const filteredItems = parsedItems.filter((item) => itemMatchesTab(item, roadmapTab));
  const selectedFilteredItem =
    filteredItems[Math.min(selectedItemIndex, Math.max(filteredItems.length - 1, 0))] || null;
  const selectedGlobalIndex = selectedFilteredItem
    ? parsedItems.findIndex(
        (item) =>
          item.title === selectedFilteredItem.title &&
          item.date === selectedFilteredItem.date &&
          item.type === selectedFilteredItem.type,
      )
    : -1;

  const updateParsedItem = (index: number, updates: Partial<ParsedItem>) => {
    setParsedItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  };

  const handleExport = async (target: ExportTarget) => {
    setSelectedTarget(target);

    if (!parsedItems.length) {
      Alert.alert("Parse first", "Analyze the syllabus before exporting it.");
      return;
    }

    setIsExporting(true);

    try {
      if (target === "Apple Calendar") {
        await exportToDeviceCalendar(parsedItems);
        Alert.alert("Calendar updated", `Added ${parsedItems.length} items.`);
      } else if (target === "Google Calendar") {
        await beginGoogleExport(parsedItems, sessionId);
        Alert.alert("Google Calendar", "Export sent to Google.");
      } else {
        await beginNotionExport(parsedItems, sessionId);
        Alert.alert("Notion", "Export sent to Notion.");
      }
    } catch (error) {
      Alert.alert(
        `${target} export`,
        error instanceof Error ? error.message : "Please try again.",
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
              Syllabus to calendar.
            </Text>
            <Text style={styles.heroBody}>
              Upload. Review. Export.
            </Text>

            <View style={styles.heroCard}>
              <View style={styles.heroCardTop}>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Uploads</Text>
                  <Text style={styles.metricValue}>
                    {isPremiumUnlocked ? "Unlimited" : "1 free"}
                  </Text>
                </View>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Mode</Text>
                  <Text style={styles.metricValue}>
                    {parseMode === "live" ? "Live" : "Ready"}
                  </Text>
                </View>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Export</Text>
                  <Text style={styles.metricValue}>{selectedTarget}</Text>
                </View>
              </View>

              <Text style={styles.cardTitle}>Import and analyze</Text>
              <Text style={styles.cardBody}>
                PDF, JPEG, HEIC, or photo.
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
                  onPress={handleUseSampleSyllabus}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Sample</Text>
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
                    {isParsing ? "Analyzing..." : "Analyze"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.filenameRow}>
                <Text style={styles.filenameText}>
                  {importedFile ? importedFile.name : "No syllabus selected yet"}
                </Text>
              </View>
            </View>

            <View style={styles.mainCard}>
              <View style={styles.tabRow}>
                {pageTabs.map((tab) => {
                  const isActive = activePage === tab;

                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setActivePage(tab)}
                      style={[styles.tabChip, isActive && styles.tabChipActive]}
                    >
                      <Text
                        style={[styles.tabChipText, isActive && styles.tabChipTextActive]}
                      >
                        {tab}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {activePage === "Plan" ? (
              <View style={styles.compactRow}>
                <View style={styles.halfCard}>
                  <Text style={styles.sectionLabel}>Before upload</Text>
                  <Text style={styles.infoTitle}>Roadmap + edit</Text>
                  <View style={styles.tabRow}>
                    {roadmapTabs.map((tab) => {
                      const isActive = roadmapTab === tab;

                      return (
                        <Pressable
                          key={tab}
                          onPress={() => {
                            setRoadmapTab(tab);
                            setSelectedItemIndex(0);
                          }}
                          style={[styles.tabChip, isActive && styles.tabChipActive]}
                        >
                          <Text
                            style={[styles.tabChipText, isActive && styles.tabChipTextActive]}
                          >
                            {tab}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.heatmap}>
                    {[palette.blush, palette.sage, palette.forest, palette.olive, palette.accent, palette.forest].map(
                      (color, index) => (
                        <View
                          key={index}
                          style={[styles.heatCell, { backgroundColor: color }]}
                        />
                      ),
                    )}
                  </View>
                  {filteredItems.length ? (
                    <View style={styles.parsedList}>
                      {filteredItems.slice(0, 3).map((item, index) => (
                        <Pressable
                          key={`${item.title}-${item.date}-${index}`}
                          onPress={() => setSelectedItemIndex(index)}
                          style={[
                            styles.parsedRow,
                            selectedFilteredItem === item && styles.parsedRowActive,
                          ]}
                        >
                          <Text style={styles.parsedTitle}>{item.title}</Text>
                          <Text style={styles.parsedMeta}>
                            {labelForItemType(item.type)} • {formatDisplayDate(item.date)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyStateText}>
                      No {roadmapTab.toLowerCase()} yet. Analyze a syllabus or switch tabs.
                    </Text>
                  )}

                  {selectedFilteredItem && selectedGlobalIndex >= 0 ? (
                    <View style={styles.editorCard}>
                      <Text style={styles.editorTitle}>Editable page</Text>
                      <TextInput
                        value={selectedFilteredItem.title}
                        onChangeText={(text) =>
                          updateParsedItem(selectedGlobalIndex, { title: text })
                        }
                        placeholder="Title"
                        placeholderTextColor={palette.textSoft}
                        style={styles.editorInput}
                      />
                      <TextInput
                        value={selectedFilteredItem.date}
                        onChangeText={(text) =>
                          updateParsedItem(selectedGlobalIndex, { date: text })
                        }
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={palette.textSoft}
                        style={styles.editorInput}
                      />
                      <TextInput
                        value={selectedFilteredItem.notes || ""}
                        onChangeText={(text) =>
                          updateParsedItem(selectedGlobalIndex, { notes: text })
                        }
                        placeholder="Notes"
                        placeholderTextColor={palette.textSoft}
                        style={[styles.editorInput, styles.editorNotes]}
                        multiline
                      />
                    </View>
                  ) : null}
                </View>

                <View style={styles.halfCard}>
                  <Text style={styles.sectionLabel}>Connections</Text>
                  <Text style={styles.infoTitle}>Export</Text>
                  <View style={styles.chipRow}>
                    {exportTargets.map((target) => {
                      const isSelected = target === selectedTarget;

                      return (
                        <Pressable
                          key={target}
                          onPress={() => handleExport(target)}
                          style={[styles.chip, isSelected && styles.chipActive]}
                        >
                          <Text
                            style={[styles.chipText, isSelected && styles.chipTextActive]}
                          >
                            {isExporting && isSelected ? "Working..." : target}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.buttonRow}>
                    <Pressable
                      onPress={async () => {
                        try {
                          await beginGoogleOAuth(sessionId);
                        } catch (error) {
                          Alert.alert(
                            "Google connect",
                            error instanceof Error ? error.message : "Could not start Google OAuth.",
                          );
                        }
                      }}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        styles.smallButton,
                        pressed && styles.secondaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {googleConnected ? "Reconnect Google" : "Connect Google"}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={async () => {
                        try {
                          await beginNotionOAuth(sessionId);
                        } catch (error) {
                          Alert.alert(
                            "Notion connect",
                            error instanceof Error ? error.message : "Could not start Notion OAuth.",
                          );
                        }
                      }}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        styles.smallButton,
                        pressed && styles.secondaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {notionConnected ? "Reconnect Notion" : "Connect Notion"}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={refreshConnections}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        styles.smallButton,
                        pressed && styles.secondaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {isRefreshingConnections ? "Refreshing..." : "Refresh"}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.checkList}>
                    {integrationSummary.map((item) => (
                      <Text key={item} style={styles.checkListItem}>
                        {item}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>
              ) : null}

              {activePage === "Help" ? (
                <View style={styles.singlePageCard}>
                  <Text style={styles.sectionLabel}>Help</Text>
                  <Text style={styles.infoTitle}>How it works</Text>
                  <View style={styles.checkList}>
                    <Text style={styles.checkListItem}>1. Upload a syllabus.</Text>
                    <Text style={styles.checkListItem}>2. Review assignments, exams, and events.</Text>
                    <Text style={styles.checkListItem}>3. Edit anything before export.</Text>
                    <Text style={styles.checkListItem}>4. Export to Google Calendar, Apple Calendar, or Notion.</Text>
                  </View>
                </View>
              ) : null}

              {activePage === "Feedback" ? (
                <View style={styles.singlePageCard}>
                  <Text style={styles.sectionLabel}>Feedback</Text>
                  <Text style={styles.infoTitle}>Send feedback</Text>
                  <TextInput
                    value={feedbackText}
                    onChangeText={setFeedbackText}
                    placeholder="Tell us what to improve"
                    placeholderTextColor={palette.textSoft}
                    style={[styles.editorInput, styles.feedbackInput]}
                    multiline
                  />
                  <Pressable
                    onPress={() => Alert.alert("Feedback", feedbackText ? "Feedback saved for review." : "Write something first.")}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      styles.smallButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Send feedback</Text>
                  </Pressable>
                </View>
              ) : null}

              {activePage === "Subscribe" ? (
                <View style={styles.singlePageCard}>
                  <Text style={styles.sectionLabel}>Subscribe</Text>
                  <Text style={styles.infoTitle}>Unlimited syllabi</Text>
                  <Text style={styles.footerBody}>$3.99 per month.</Text>
                  <Text style={styles.cardBody}>Use one syllabus free. Subscribe for unlimited uploads and export support across platforms.</Text>
                  <Pressable
                    onPress={handleUnlockPremium}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      styles.unlockButton,
                      pressed && styles.primaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isPremiumUnlocked
                        ? "Subscribed"
                        : isPurchasing
                          ? "Starting..."
                          : "Subscribe for $3.99/mo"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={async () => {
                      try {
                        setIsPurchasing(true);
                        const unlocked = await restoreSubscription();
                        setIsPremiumUnlocked(unlocked);
                        Alert.alert(
                          unlocked ? "Restored" : "No subscription found",
                          unlocked ? "Your subscription has been restored." : "No active subscription was found.",
                        );
                      } catch (error) {
                        Alert.alert(
                          "Restore failed",
                          error instanceof Error ? error.message : "Could not restore subscription.",
                        );
                      } finally {
                        setIsPurchasing(false);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      styles.smallButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Restore subscription</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.footerCard}>
              <View style={styles.footerBlock}>
                <Text style={styles.sectionLabel}>Subscription</Text>
                <Text style={styles.footerTitle}>Unlimited syllabi for $3.99/month</Text>
                <Text style={styles.footerBody}>
                  One free syllabus. Subscribe for unlimited uploads.
                </Text>
              </View>

              <Pressable
                onPress={handleUnlockPremium}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.unlockButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isPremiumUnlocked
                    ? "Subscribed"
                    : isPurchasing
                      ? "Starting..."
                      : "Subscribe"}
                </Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  try {
                    setIsPurchasing(true);
                    const unlocked = await restoreSubscription();
                    setIsPremiumUnlocked(unlocked);
                    Alert.alert(
                      unlocked ? "Restored" : "No subscription found",
                      unlocked
                        ? "Your subscription has been restored."
                        : "No active subscription was found.",
                    );
                  } catch (error) {
                    Alert.alert(
                      "Restore failed",
                      error instanceof Error ? error.message : "Could not restore purchases.",
                    );
                  } finally {
                    setIsPurchasing(false);
                  }
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.smallButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Restore subscription</Text>
              </Pressable>
            </View>

            <Text style={styles.bottomFootnote}>
              Session: {sessionId} • Parse API: {appConfig.parseApiBaseUrl || "demo"}
            </Text>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: "center",
  },
  contentColumn: {
    width: "100%",
    maxWidth: 560,
    alignItems: "center",
    gap: 10,
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
    marginTop: 8,
    color: palette.textSoft,
    textTransform: "uppercase",
    letterSpacing: 3,
    fontSize: 11,
    fontFamily: sansFont,
    textAlign: "center",
  },
  heroTitle: {
    color: palette.text,
    fontSize: 31,
    lineHeight: 35,
    fontFamily: "Alice",
    maxWidth: 400,
    textAlign: "center",
  },
  heroBody: {
    color: palette.textSoft,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: sansFont,
    maxWidth: 340,
    textAlign: "center",
  },
  heroCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 10,
    shadowColor: "#45533F",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    alignItems: "center",
  },
  heroCardTop: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  metricPill: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 96,
    alignItems: "center",
  },
  metricLabel: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  metricValue: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 13,
    marginTop: 2,
  },
  cardTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 23,
    lineHeight: 27,
    textAlign: "center",
  },
  cardBody: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 420,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: palette.forest,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonText: {
    color: "#F9F5EE",
    fontFamily: sansFont,
    fontSize: 15,
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontSize: 14,
  },
  filenameRow: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#F7F0E6",
  },
  filenameText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  mainCard: {
    width: "100%",
    backgroundColor: "rgba(251, 247, 240, 0.9)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
  },
  singlePageCard: {
    width: "100%",
    gap: 12,
    alignItems: "center",
    paddingVertical: 6,
  },
  compactRow: {
    width: "100%",
    gap: 12,
  },
  halfCard: {
    width: "100%",
    gap: 10,
    alignItems: "center",
  },
  sectionLabel: {
    color: palette.textSoft,
    textTransform: "uppercase",
    letterSpacing: 2.4,
    fontSize: 11,
    fontFamily: sansFont,
    textAlign: "center",
  },
  infoTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 21,
    lineHeight: 25,
    textAlign: "center",
  },
  heatmap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  heatCell: {
    width: 24,
    height: 24,
    borderRadius: 8,
  },
  parsedList: {
    width: "100%",
    gap: 8,
  },
  parsedRow: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#F7F0E6",
    gap: 3,
  },
  parsedRowActive: {
    borderWidth: 1,
    borderColor: palette.forest,
    backgroundColor: "#F1EADB",
  },
  parsedTitle: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
    textAlign: "center",
  },
  parsedMeta: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "center",
  },
  emptyStateText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  tabChip: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabChipActive: {
    backgroundColor: palette.forest,
  },
  tabChipText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 12,
  },
  tabChipTextActive: {
    color: "#F9F5EE",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  chip: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: palette.forest,
  },
  chipText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 13,
  },
  chipTextActive: {
    color: "#F9F5EE",
  },
  checkList: {
    gap: 5,
    alignItems: "center",
  },
  checkListItem: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  editorCard: {
    width: "100%",
    backgroundColor: "#F8F2E8",
    borderRadius: 16,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  editorTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 18,
    lineHeight: 22,
    textAlign: "center",
  },
  editorInput: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
  },
  editorNotes: {
    minHeight: 68,
    textAlignVertical: "top",
  },
  feedbackInput: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  footerCard: {
    width: "100%",
    backgroundColor: "#F8F3E9",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
    alignItems: "center",
  },
  footerBlock: {
    gap: 6,
    alignItems: "center",
  },
  footerTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 22,
    lineHeight: 25,
    textAlign: "center",
  },
  footerBody: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  unlockButton: {
    minWidth: 150,
  },
  smallButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bottomFootnote: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "center",
  },
});
