import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
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

import {
  beginGoogleExport,
  beginNotionExport,
  exportToDeviceCalendar,
} from "./src/services/exporters";
import {
  beginGoogleOAuth,
  beginNotionOAuth,
  fetchIntegrationStatus,
  linkNotionDatabase,
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
  surfaceSoft: "#F7F0E6",
  border: "#E2D7C3",
  text: "#315F57",
  textSoft: "#6F857F",
  forest: "#366D61",
  sage: "#A8B88A",
  accent: "#D8C48F",
};

const exportTargets: ExportTarget[] = [
  "Google Calendar",
  "Apple Calendar",
  "Notion",
];

const roadmapTabs = ["Assignments", "Exams", "Events"] as const;
type RoadmapTab = (typeof roadmapTabs)[number];

const previewModes = ["List", "Calendar", "Notion"] as const;
type PreviewMode = (typeof previewModes)[number];

const navTabs = ["home", "premium", "help", "feedback"] as const;
type NavTab = (typeof navTabs)[number];

const sansFont = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif-medium",
  default: "System",
});

function createSessionId() {
  return `session-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

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

function groupItemsByDate(items: ParsedItem[]) {
  return items.reduce<Record<string, ParsedItem[]>>((groups, item) => {
    if (!groups[item.date]) {
      groups[item.date] = [];
    }

    groups[item.date].push(item);
    return groups;
  }, {});
}

function editorDestinationCopy(
  target: ExportTarget,
  notionDatabaseTitle: string | null,
) {
  if (target === "Notion") {
    return notionDatabaseTitle
      ? `This item will be sent to ${notionDatabaseTitle}.`
      : "Link a Notion database to send this item there.";
  }

  if (target === "Google Calendar") {
    return "This item will export as a Google Calendar event.";
  }

  return "This item will export as a calendar event on this device.";
}

function NavIcon({ tab, active }: { tab: NavTab; active: boolean }) {
  const color = active ? palette.forest : palette.textSoft;

  if (tab === "home") {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.iconHomeRoof, { borderBottomColor: color }]} />
        <View style={[styles.iconHomeBase, { borderColor: color }]} />
      </View>
    );
  }

  if (tab === "premium") {
    return (
      <View style={styles.iconBox}>
        <Text style={[styles.iconGlyph, { color }]}>✦</Text>
      </View>
    );
  }

  if (tab === "help") {
    return (
      <View style={styles.iconBox}>
        <View style={[styles.iconBook, { borderColor: color }]}>
          <View style={[styles.iconBookSpine, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.iconBox}>
      <View style={[styles.iconEnvelope, { borderColor: color }]} />
      <View style={[styles.iconEnvelopeFlapLeft, { borderRightColor: color }]} />
      <View style={[styles.iconEnvelopeFlapRight, { borderLeftColor: color }]} />
    </View>
  );
}

function AppContent() {
  const [fontsLoaded] = useFonts({
    Alice: require("./Alice/Alice-Regular.ttf"),
  });
  const [showLanding, setShowLanding] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [selectedTarget, setSelectedTarget] =
    useState<ExportTarget>("Google Calendar");
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sessionId] = useState(createSessionId);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionDatabaseTitle, setNotionDatabaseTitle] = useState<string | null>(null);
  const [isRefreshingConnections, setIsRefreshingConnections] = useState(false);
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [roadmapTab, setRoadmapTab] = useState<RoadmapTab>("Assignments");
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("List");
  const [feedbackText, setFeedbackText] = useState("");
  const [notionDatabaseLink, setNotionDatabaseLink] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLanding(false);
    }, 1100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const refreshConnections = async () => {
      try {
        const status = await fetchIntegrationStatus(sessionId);
        setGoogleConnected(status.googleConnected);
        setNotionConnected(status.notionConnected);
        setNotionDatabaseTitle(status.notionDatabaseTitle);
      } catch {
        setGoogleConnected(false);
        setNotionConnected(false);
        setNotionDatabaseTitle(null);
      }
    };

    void refreshConnections();
  }, [sessionId]);

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

  const filteredItems = parsedItems.filter((item) => itemMatchesTab(item, roadmapTab));
  const groupedPreviewItems = Object.entries(groupItemsByDate(filteredItems))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 4);
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

  const applyImportedFile = (file: ImportedFile) => {
    setImportedFile(file);
    setParsedItems([]);
    setSelectedItemIndex(0);
  };

  const refreshConnections = async () => {
    setIsRefreshingConnections(true);

    try {
      const status = await fetchIntegrationStatus(sessionId);
      setGoogleConnected(status.googleConnected);
      setNotionConnected(status.notionConnected);
      setNotionDatabaseTitle(status.notionDatabaseTitle);
    } catch {
      Alert.alert("Connections", "Could not refresh connections.");
    } finally {
      setIsRefreshingConnections(false);
    }
  };

  const handleUseExample = async () => {
    const exampleFile: ImportedFile = {
      name: "sample-course-syllabus.pdf",
      typeLabel: "PDF",
      source: "document",
      uri: "demo://sample-syllabus",
      mimeType: "application/pdf",
    };

    applyImportedFile(exampleFile);
    setIsParsing(true);

    try {
      const result = await parseSyllabus(exampleFile);
      setParsedItems(result.items);
      setSelectedItemIndex(0);
      setPreviewMode("List");
    } catch {
      Alert.alert("Example", "Could not load the example schedule.");
    } finally {
      setIsParsing(false);
    }
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
      Alert.alert("Import", "Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handlePickPhoto = async () => {
    setIsImporting(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Photos", "Allow photo access to continue.");
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
      Alert.alert("Photo", "Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!importedFile) {
      Alert.alert("Syllabus", "Choose a file or photo first.");
      return;
    }

    setIsParsing(true);

    try {
      const result = await parseSyllabus(importedFile);
      setParsedItems(result.items);
      setSelectedItemIndex(0);
      setPreviewMode("List");
    } catch {
      Alert.alert("Schedule", "Could not create the schedule.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleExport = async (target: ExportTarget) => {
    setSelectedTarget(target);

    if (!parsedItems.length) {
      Alert.alert("Export", "Create the schedule first.");
      return;
    }

    setIsExporting(true);

    try {
      if (target === "Apple Calendar") {
        await exportToDeviceCalendar(parsedItems);
        Alert.alert("Apple Calendar", "Export complete.");
      } else if (target === "Google Calendar") {
        await beginGoogleExport(parsedItems, sessionId);
        Alert.alert("Google Calendar", "Export complete.");
      } else {
        await beginNotionExport(parsedItems, sessionId);
        Alert.alert("Notion", "Export complete.");
      }
    } catch (error) {
      Alert.alert(
        `${target}`,
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleSubscribe = async () => {
    setIsPurchasing(true);

    try {
      const unlocked = await purchaseSubscription();
      setIsPremiumUnlocked(unlocked);
      Alert.alert(unlocked ? "Subscribed" : "Subscription", "Done.");
    } catch (error) {
      Alert.alert(
        "Subscription",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  if (!fontsLoaded) {
    return <View style={styles.loadingScreen} />;
  }

  if (showLanding) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.landingSafeArea}>
          <StatusBar style="dark" />
          <View style={styles.landingScreen}>
            <Text style={styles.landingTitle}>Syllabus to Calendar</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.appFrame}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroGlowOne} />
            <View style={styles.heroGlowTwo} />

            {activeTab === "home" ? (
              <View style={styles.pageColumn}>
                <Text style={styles.heroTitle}>Syllabus to Calendar</Text>
                <Text style={styles.heroBody}>Upload. Review. Export.</Text>

                <View style={styles.heroCard}>
                  <Text style={styles.cardTitle}>Start with a syllabus</Text>
                  <Text style={styles.cardBody}>Choose one way to begin.</Text>
                  <View style={styles.actionList}>
                    <Pressable onPress={handlePickDocument} style={styles.actionListRow}>
                      <Text style={styles.actionListLabel}>
                        {isImporting ? "Loading..." : "Choose file"}
                      </Text>
                    </Pressable>

                    <Pressable onPress={handlePickPhoto} style={styles.actionListRow}>
                      <Text style={styles.actionListLabel}>Choose photo</Text>
                    </Pressable>

                    <Pressable onPress={() => void handleUseExample()} style={styles.actionListRow}>
                      <Text style={styles.actionListLabel}>
                        {isParsing && importedFile?.uri === "demo://sample-syllabus"
                          ? "Loading example..."
                          : "Load example schedule"}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.inlineDivider} />

                  {importedFile ? (
                    <View style={styles.stepBlock}>
                      <Text style={styles.sectionLabel}>Next</Text>
                      <Pressable
                        onPress={handleCreateSchedule}
                        style={styles.actionListRow}
                        disabled={isParsing}
                      >
                        <Text style={styles.actionListLabel}>
                          {isParsing ? "Reading..." : "Create schedule"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <Text style={styles.fileNameText}>
                    {importedFile ? importedFile.name : "No syllabus selected"}
                  </Text>
                </View>

                {parsedItems.length ? (
                  <View style={styles.contentCard}>
                    <Text style={styles.sectionLabel}>Review</Text>
                    <Text style={styles.infoTitle}>Review</Text>

                    <View style={styles.navRow}>
                      {roadmapTabs.map((tab) => {
                        const isActive = roadmapTab === tab;

                        return (
                          <Pressable
                            key={tab}
                            onPress={() => {
                              setRoadmapTab(tab);
                              setSelectedItemIndex(0);
                            }}
                          >
                            <Text
                              style={[styles.navText, isActive && styles.navTextActive]}
                            >
                              {tab}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={styles.previewBlock}>
                      <View style={styles.previewHeader}>
                        <Text style={styles.sectionLabel}>Preview</Text>
                        <View style={styles.navRow}>
                          {previewModes.map((mode) => {
                            const isActive = previewMode === mode;

                            return (
                              <Pressable
                                key={mode}
                                onPress={() => setPreviewMode(mode)}
                              >
                                <Text
                                  style={[styles.navText, isActive && styles.navTextActive]}
                                >
                                  {mode}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>

                      <Text style={styles.previewTitle}>
                        {previewMode === "List"
                          ? "List"
                          : previewMode === "Calendar"
                            ? "Calendar"
                            : "Notion"}
                      </Text>

                      {filteredItems.length ? (
                        previewMode === "List" ? (
                          <View style={styles.previewList}>
                            {filteredItems.slice(0, 3).map((item, index) => (
                              <View key={`${item.title}-${item.date}-${index}`} style={styles.previewListRow}>
                                <Text style={styles.previewPrimaryText}>{item.title}</Text>
                                <Text style={styles.previewSecondaryText}>
                                  {labelForItemType(item.type)} • {formatDisplayDate(item.date)}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : previewMode === "Calendar" ? (
                          <View style={styles.calendarPreview}>
                            {groupedPreviewItems.map(([date, items]) => (
                              <View key={date} style={styles.calendarDayRow}>
                                <Text style={styles.calendarDate}>{formatDisplayDate(date)}</Text>
                                <View style={styles.calendarItems}>
                                  {items.slice(0, 2).map((item, index) => (
                                    <Text
                                      key={`${item.title}-${index}`}
                                      style={styles.calendarItemText}
                                    >
                                      {item.title}
                                    </Text>
                                  ))}
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <View style={styles.notionPreview}>
                            <View style={styles.notionHeaderRow}>
                              <Text style={[styles.notionCell, styles.notionHeaderCell]}>Name</Text>
                              <Text style={[styles.notionCell, styles.notionHeaderCell]}>Date</Text>
                              <Text style={[styles.notionCell, styles.notionHeaderCell]}>Type</Text>
                            </View>
                            {filteredItems.slice(0, 3).map((item, index) => (
                              <View
                                key={`${item.title}-${item.date}-${index}`}
                                style={styles.notionRow}
                              >
                                <Text style={styles.notionCell}>{item.title}</Text>
                                <Text style={styles.notionCell}>{formatDisplayDate(item.date)}</Text>
                                <Text style={styles.notionCell}>{labelForItemType(item.type)}</Text>
                              </View>
                            ))}
                          </View>
                        )
                      ) : (
                        <Text style={styles.emptyStateText}>No items in this section.</Text>
                      )}
                    </View>

                    {filteredItems.length ? (
                      <View style={styles.itemList}>
                        {filteredItems.slice(0, 4).map((item, index) => (
                          <Pressable
                            key={`${item.title}-${item.date}-${index}`}
                            onPress={() => setSelectedItemIndex(index)}
                            style={[
                              styles.itemRow,
                              selectedFilteredItem === item && styles.itemRowActive,
                            ]}
                          >
                            <Text style={styles.itemTitle}>{item.title}</Text>
                            <Text style={styles.itemMeta}>
                              {labelForItemType(item.type)} • {formatDisplayDate(item.date)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    {selectedFilteredItem && selectedGlobalIndex >= 0 ? (
                      <View style={styles.editorCard}>
                        <Text style={styles.sectionLabel}>Selected item</Text>
                        <Text style={styles.editorTitle}>Details</Text>
                        <Text style={styles.helperText}>
                          {editorDestinationCopy(selectedTarget, notionDatabaseTitle)}
                        </Text>
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
                ) : null}

                {parsedItems.length ? (
                  <View style={styles.contentCard}>
                    <Text style={styles.sectionLabel}>Export</Text>
                    <Text style={styles.infoTitle}>Choose a destination</Text>

                    <View style={styles.exportList}>
                      {exportTargets.map((target) => {
                        const isSelected = target === selectedTarget;

                        return (
                          <Pressable
                            key={target}
                            onPress={() => handleExport(target)}
                            style={styles.exportRow}
                          >
                            <Text
                              style={[styles.exportText, isSelected && styles.exportTextActive]}
                            >
                              {isExporting && isSelected ? "Working..." : target}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={styles.connectionList}>
                      <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Google Calendar</Text>
                        <Text style={styles.connectionStatusText}>
                          {googleConnected ? "Connected" : "Not connected"}
                        </Text>
                      </View>

                      <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Notion</Text>
                        <Text style={styles.connectionStatusText}>
                          {notionConnected ? "Connected" : "Not connected"}
                        </Text>
                      </View>

                      <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Refresh status</Text>
                        <Pressable onPress={refreshConnections}>
                          <Text style={styles.connectionAction}>
                            {isRefreshingConnections ? "Loading..." : "Refresh"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    {selectedTarget === "Notion" ? (
                      <View style={styles.editorCard}>
                        <Text style={styles.editorTitle}>Notion database</Text>
                        <TextInput
                          value={notionDatabaseLink}
                          onChangeText={setNotionDatabaseLink}
                          placeholder="Paste a Notion database link"
                          placeholderTextColor={palette.textSoft}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={styles.editorInput}
                        />
                        <Pressable
                          onPress={async () => {
                            try {
                              const result = await linkNotionDatabase(
                                sessionId,
                                notionDatabaseLink,
                              );
                              setNotionDatabaseTitle(result.databaseTitle);
                              Alert.alert("Notion", "Database linked.");
                            } catch (error) {
                              Alert.alert(
                                "Notion",
                                error instanceof Error ? error.message : "Could not link database.",
                              );
                            }
                          }}
                          style={({ pressed }) => [
                            styles.secondaryButton,
                            pressed && styles.secondaryButtonPressed,
                          ]}
                        >
                          <Text style={styles.secondaryButtonText}>Save database</Text>
                        </Pressable>
                        {notionDatabaseTitle ? (
                          <Text style={styles.helperText}>{notionDatabaseTitle}</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.adSlot}>
                  <Text style={styles.adLabel}>Ad space</Text>
                  <Text style={styles.adCopy}>Reserved for a banner placement.</Text>
                </View>
              </View>
            ) : null}

            {activeTab === "premium" ? (
              <View style={styles.pageColumn}>
                <Text style={styles.heroTitle}>Premium</Text>
                <View style={styles.contentCard}>
                  <Text style={styles.infoTitle}>Unlimited syllabi</Text>
                  <Text style={styles.cardBody}>$3.99 per month.</Text>
                  <View style={styles.benefitList}>
                    <Text style={styles.benefitText}>Unlimited syllabus uploads</Text>
                    <Text style={styles.benefitText}>Google, Apple, and Notion export</Text>
                    <Text style={styles.benefitText}>Full editing before export</Text>
                    <Text style={styles.benefitText}>Future attendance tools</Text>
                  </View>
                  <Pressable
                    onPress={() => void handleSubscribe()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isPremiumUnlocked
                        ? "Subscribed"
                        : isPurchasing
                          ? "Starting..."
                          : "Start subscription"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      try {
                        setIsPurchasing(true);
                        const unlocked = await restoreSubscription();
                        setIsPremiumUnlocked(unlocked);
                        Alert.alert("Subscription", unlocked ? "Restored." : "Not found.");
                      } catch (error) {
                        Alert.alert(
                          "Subscription",
                          error instanceof Error ? error.message : "Please try again.",
                        );
                      } finally {
                        setIsPurchasing(false);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Restore subscription</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {activeTab === "help" ? (
              <View style={styles.pageColumn}>
                <Text style={styles.heroTitle}>Help</Text>
                <View style={styles.contentCard}>
                  <Text style={styles.infoTitle}>How it works</Text>
                  <View style={styles.helpList}>
                    <Text style={styles.helpText}>1. Add your syllabus file.</Text>
                    <Text style={styles.helpText}>2. Create the schedule in this app.</Text>
                    <Text style={styles.helpText}>3. Review and edit syllabus items.</Text>
                    <Text style={styles.helpText}>4. Export assignments and important dates to your preferred platform.</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {activeTab === "feedback" ? (
              <View style={styles.pageColumn}>
                <Text style={styles.heroTitle}>Contact</Text>
                <View style={styles.contentCard}>
                  <Text style={styles.infoTitle}>Feedback</Text>
                  <TextInput
                    value={feedbackText}
                    onChangeText={setFeedbackText}
                    placeholder="Tell us what to improve"
                    placeholderTextColor={palette.textSoft}
                    style={[styles.editorInput, styles.feedbackInput]}
                    multiline
                  />
                  <Pressable
                    onPress={() =>
                      Alert.alert("Feedback", feedbackText ? "Saved." : "Write something first.")
                    }
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>Send feedback</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.navArea}>
            <View style={styles.navShell}>
              {navTabs.map((tab) => {
                const active = activeTab === tab;

                return (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={styles.navButton}
                  >
                    <NavIcon tab={tab} active={active} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
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
  landingSafeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  landingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
  },
  landingTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 36,
    lineHeight: 40,
    textAlign: "center",
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  appFrame: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    alignItems: "center",
  },
  pageColumn: {
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
  heroTitle: {
    marginTop: 8,
    color: palette.text,
    fontSize: 30,
    lineHeight: 34,
    fontFamily: "Alice",
    textAlign: "center",
  },
  heroBody: {
    color: palette.textSoft,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: sansFont,
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
    alignItems: "center",
  },
  summaryStrip: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
  },
  summaryDivider: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
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
    lineHeight: 19,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  actionList: {
    width: "100%",
    gap: 0,
  },
  actionListRow: {
    width: "100%",
    paddingVertical: 11,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  actionListLabel: {
    color: palette.forest,
    fontFamily: sansFont,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  disabledActionText: {
    color: palette.textSoft,
    fontWeight: "500",
  },
  inlineDivider: {
    width: "100%",
    height: 1,
    backgroundColor: palette.border,
    opacity: 0.8,
  },
  primaryButton: {
    backgroundColor: palette.forest,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryButton: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  ghostButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  parseButton: {
    backgroundColor: palette.surfaceSoft,
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  secondaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonText: {
    color: "#F9F5EE",
    fontFamily: sansFont,
    fontSize: 14,
  },
  secondaryButtonText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
  },
  ghostButtonText: {
    color: palette.forest,
    fontFamily: sansFont,
    fontSize: 14,
  },
  fileNameText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  stepBlock: {
    width: "100%",
    gap: 2,
    alignItems: "center",
  },
  stepTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 18,
    lineHeight: 21,
    textAlign: "center",
  },
  contentCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 10,
    alignItems: "center",
  },
  sectionLabel: {
    color: palette.textSoft,
    textTransform: "uppercase",
    letterSpacing: 2.2,
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
  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "center",
  },
  navText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
  },
  navTextActive: {
    color: palette.forest,
    fontWeight: "600",
  },
  previewBlock: {
    width: "100%",
    gap: 8,
    alignItems: "center",
  },
  previewHeader: {
    width: "100%",
    gap: 6,
    alignItems: "center",
  },
  previewTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 18,
    lineHeight: 21,
    textAlign: "center",
  },
  previewList: {
    width: "100%",
    gap: 8,
  },
  previewListRow: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: palette.surfaceSoft,
    gap: 3,
  },
  previewPrimaryText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
    textAlign: "center",
  },
  previewSecondaryText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "center",
  },
  calendarPreview: {
    width: "100%",
    gap: 8,
  },
  calendarDayRow: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: palette.surfaceSoft,
  },
  calendarDate: {
    width: 68,
    color: palette.forest,
    fontFamily: sansFont,
    fontSize: 13,
    fontWeight: "600",
  },
  calendarItems: {
    flex: 1,
    gap: 4,
  },
  calendarItemText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 13,
  },
  notionPreview: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.border,
  },
  notionHeaderRow: {
    flexDirection: "row",
    backgroundColor: palette.surfaceSoft,
  },
  notionRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
  },
  notionCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "center",
  },
  notionHeaderCell: {
    color: palette.textSoft,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  itemList: {
    width: "100%",
    gap: 8,
  },
  itemRow: {
    width: "100%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: palette.surfaceSoft,
    borderRadius: 14,
    alignItems: "center",
    gap: 4,
  },
  itemRowActive: {
    borderWidth: 1,
    borderColor: palette.forest,
  },
  itemTitle: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
    textAlign: "center",
  },
  itemMeta: {
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
  editorCard: {
    width: "100%",
    backgroundColor: palette.surfaceSoft,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    alignItems: "center",
  },
  editorTitle: {
    color: palette.text,
    fontFamily: "Alice",
    fontSize: 18,
    lineHeight: 21,
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
  exportList: {
    width: "100%",
    gap: 8,
  },
  exportRow: {
    width: "100%",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    alignItems: "center",
  },
  exportText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 14,
  },
  exportTextActive: {
    color: palette.forest,
    fontWeight: "600",
  },
  connectionList: {
    width: "100%",
    gap: 2,
  },
  connectionRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  connectionLabel: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 13,
  },
  connectionAction: {
    color: palette.forest,
    fontFamily: sansFont,
    fontSize: 13,
    fontWeight: "600",
  },
  connectionStatusText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
  },
  helperText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "center",
  },
  adSlot: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 4,
  },
  adLabel: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  adCopy: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  benefitList: {
    gap: 8,
    alignItems: "center",
  },
  benefitText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
    textAlign: "center",
  },
  helpList: {
    gap: 8,
    alignItems: "center",
  },
  helpText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
    textAlign: "center",
  },
  feedbackInput: {
    minHeight: 140,
    textAlignVertical: "top",
  },
  navShell: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: "rgba(251, 247, 240, 0.96)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navArea: {
    backgroundColor: palette.background,
    paddingTop: 4,
  },
  navButton: {
    width: 48,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: {
    fontSize: 18,
    lineHeight: 18,
    fontFamily: sansFont,
    fontWeight: "600",
  },
  iconHomeRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginBottom: 1,
  },
  iconHomeBase: {
    width: 14,
    height: 10,
    borderWidth: 2,
    borderTopWidth: 0,
  },
  iconBook: {
    width: 16,
    height: 18,
    borderWidth: 2,
    borderRadius: 3,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingLeft: 4,
  },
  iconBookSpine: {
    width: 2,
    height: 10,
    borderRadius: 2,
  },
  iconEnvelope: {
    width: 18,
    height: 13,
    borderWidth: 2,
    borderRadius: 2,
  },
  iconEnvelopeFlapLeft: {
    position: "absolute",
    top: 8,
    left: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 7,
    borderTopWidth: 0,
    borderBottomWidth: 5,
    borderLeftColor: "transparent",
    borderBottomColor: "transparent",
  },
  iconEnvelopeFlapRight: {
    position: "absolute",
    top: 8,
    right: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 4,
    borderTopWidth: 0,
    borderBottomWidth: 5,
    borderRightColor: "transparent",
    borderBottomColor: "transparent",
  },
});
