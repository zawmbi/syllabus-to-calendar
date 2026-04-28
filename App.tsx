import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { BlurView } from "expo-blur";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Animated,
  AppState,
  LayoutAnimation,
  UIManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

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

const roadmapTabs = ["All items", "Assignments", "Exams", "Labs"] as const;
type RoadmapTab = (typeof roadmapTabs)[number];

const navTabs = ["home", "premium", "help", "feedback"] as const;
type NavTab = (typeof navTabs)[number];

const sansFont = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif-medium",
  default: "System",
});

const importActions = [
  { key: "file", label: "Choose file" },
  { key: "photo", label: "Choose photo" },
  { key: "example", label: "Load example schedule" },
] as const;

const redesignColors = {
  paper: "#F5EFDC",
  paperDeep: "#EBE3C8",
  paperShade: "#E6DDBE",
  card: "#FBF7E9",
  ink: "#1A2A20",
  inkSoft: "#4A5A50",
  inkMute: "#7A8378",
  hairline: "#D8D0B4",
  hairlineSoft: "#E4DCC0",
  forest: "#28583B",
  forestDeep: "#1C4129",
  forestShadow: "#13301C",
  gold: "#D9B25A",
  goldDeep: "#B8923B",
} as const;

function createSessionId() {
  return `session-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function inferTypeLabel(name?: string, mimeType?: string | null) {
  if (mimeType?.includes("pdf") || name?.toLowerCase().endsWith(".pdf")) {
    return "PDF";
  }

  if (
    mimeType?.includes("wordprocessingml.document") ||
    mimeType?.includes("msword") ||
    name?.toLowerCase().endsWith(".docx") ||
    name?.toLowerCase().endsWith(".doc")
  ) {
    return "DOCX";
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

function formatDisplayWeekday(rawDate: string) {
  const date = new Date(`${rawDate}T12:00:00`);

  return date.toLocaleDateString("en-US", {
    weekday: "short",
  });
}

function itemMatchesTab(item: ParsedItem, tab: RoadmapTab) {
  if (tab === "All items") {
    return item.type !== "Break";
  }

  if (tab === "Assignments") {
    return item.type === "Homework";
  }

  if (tab === "Exams") {
    return item.type === "Exam";
  }

  return item.type === "Lab / Discussion";
}

function labelForItemType(itemType: ParsedItem["type"]) {
  if (itemType === "Homework") {
    return "Assignment";
  }

  if (itemType === "Exam") {
    return "Exam";
  }

  if (itemType === "Lab / Discussion") {
    return "Lab / Discussion";
  }

  return "Break";
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

function inferAcademicBreakItems(items: ParsedItem[]) {
  if (!items.length) {
    return [];
  }

  const dates = items
    .map((item) => new Date(`${item.date}T12:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());

  if (!dates.length) {
    return [];
  }

  const year = dates[0].getFullYear();
  const month = dates[0].getMonth() + 1;

  if (month >= 7) {
    return [
      {
        title: "Labor Day",
        date: `${year}-09-07`,
        type: "Break" as const,
        notes: "Optional no-class holiday export.",
      },
      {
        title: "Fall break",
        date: `${year}-10-12`,
        type: "Break" as const,
        notes: "Optional no-class break export.",
      },
      {
        title: "Thanksgiving break",
        date: `${year}-11-26`,
        type: "Break" as const,
        notes: "Optional no-class break export.",
      },
    ];
  }

  return [
    {
      title: "Martin Luther King Jr. Day",
      date: `${year}-01-19`,
      type: "Break" as const,
      notes: "Optional no-class holiday export.",
    },
    {
      title: "Spring break",
      date: `${year}-03-16`,
      type: "Break" as const,
      notes: "Optional no-class break export.",
    },
    {
      title: "Memorial Day",
      date: `${year}-05-25`,
      type: "Break" as const,
      notes: "Optional no-class holiday export.",
    },
  ];
}

function isValidIsoDate(rawDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return false;
  }

  const date = new Date(`${rawDate}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === rawDate;
}

function summarizeExportReadiness(items: ParsedItem[]) {
  let missingTitleCount = 0;
  let invalidDateCount = 0;
  let suspiciousYearCount = 0;
  const currentYear = new Date().getFullYear();

  for (const item of items) {
    if (!item.title.trim()) {
      missingTitleCount += 1;
    }

    if (!isValidIsoDate(item.date)) {
      invalidDateCount += 1;
      continue;
    }

    const year = Number(item.date.slice(0, 4));
    if (year < currentYear - 1 || year > currentYear + 2) {
      suspiciousYearCount += 1;
    }
  }

  return {
    missingTitleCount,
    invalidDateCount,
    suspiciousYearCount,
    reviewCount: missingTitleCount + invalidDateCount + suspiciousYearCount,
  };
}

function IconBase({
  children,
  size = 22,
  color = "currentColor",
  strokeWidth = 1.6,
  fill = "none",
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
    >
      {children}
    </Svg>
  );
}

function IconUpload({ size = 22, color = "currentColor", strokeWidth = 1.7 }) {
  return (
    <IconBase size={size} color={color} strokeWidth={strokeWidth}>
      <Path d="M12 16V4" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconCamera({ size = 18, color = "currentColor" }) {
  return (
    <IconBase size={size} color={color}>
      <Path d="M3 8h3l2-2h8l2 2h3v11H3z" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="13" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconSparkleLine({ size = 18, color = "currentColor" }) {
  return (
    <IconBase size={size} color={color}>
      <Path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconCalendar({ size = 20, color = "currentColor", strokeWidth = 1.6 }) {
  return (
    <IconBase size={size} color={color} strokeWidth={strokeWidth}>
      <Rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <Path d="M3.5 10h17" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 3v4M16 3v4" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconHome({ size = 20, color = "currentColor", strokeWidth = 1.6 }) {
  return (
    <IconBase size={size} color={color} strokeWidth={strokeWidth}>
      <Path d="M3.5 11.5L12 4l8.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5.5 10v9.5h13V10" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconLibrary({ size = 20, color = "currentColor", strokeWidth = 1.6 }) {
  return (
    <IconBase size={size} color={color} strokeWidth={strokeWidth}>
      <Rect x="4" y="4" width="5" height="16" rx="1" />
      <Rect x="11" y="4" width="5" height="16" rx="1" />
      <Path d="M18.5 5.5l3 .9-3.5 13-3-.9z" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconUser({ size = 18, color = "currentColor" }) {
  return (
    <IconBase size={size} color={color}>
      <Circle cx="12" cy="8.5" r="3.5" />
      <Path d="M5 20c1-4 4.5-5 7-5s6 1 7 5" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconArrow({ size = 17, color = "currentColor" }) {
  return (
    <IconBase size={size} color={color}>
      <Path d="M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconCheck({ size = 13, color = "currentColor" }) {
  return (
    <IconBase size={size} color={color}>
      <Path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconLock({ size = 13, color = "currentColor" }) {
  return (
    <IconBase size={size} color={color}>
      <Rect x="4.5" y="10.5" width="15" height="9" rx="2" />
      <Path d="M8 10.5V8a4 4 0 018 0v2.5" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconBolt({ size = 13, color = "currentColor" }) {
  return (
    <IconBase size={size} color={color}>
      <Path d="M13 3L5 14h6l-1 7 8-11h-6z" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function IconFile({ size = 16, color = "currentColor", strokeWidth = 1.7 }) {
  return (
    <IconBase size={size} color={color} strokeWidth={strokeWidth}>
      <Path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function SecondaryActionCard({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.homeSecondaryAction}>
      <View style={styles.homeSecondaryIconTile}>{icon}</View>
      <View style={styles.homeSecondaryText}>
        <Text style={styles.homeSecondaryLabel}>{label}</Text>
        <Text style={styles.homeSecondaryHint}>{hint}</Text>
      </View>
    </Pressable>
  );
}

function RecentRow({
  course,
  title,
  meta,
  status,
}: {
  course: string;
  title: string;
  meta: string;
  status: "exported" | "review";
}) {
  const isExported = status === "exported";
  return (
    <View style={styles.homeRecentRow}>
      <View style={styles.homeRecentFileTile}>
        <IconFile size={16} color={redesignColors.paper} />
      </View>
      <View style={styles.homeRecentBody}>
        <View style={styles.homeRecentHeading}>
          <Text style={styles.homeRecentCourse}>{course}</Text>
          <Text style={styles.homeRecentTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={styles.homeRecentMeta}>{meta}</Text>
      </View>
      <View
        style={[
          styles.homeRecentBadge,
          isExported ? styles.homeRecentBadgeExported : styles.homeRecentBadgeReview,
        ]}
      >
        <Text
          style={[
            styles.homeRecentBadgeText,
            isExported
              ? styles.homeRecentBadgeTextExported
              : styles.homeRecentBadgeTextReview,
          ]}
        >
          {isExported ? "Synced" : "Review"}
        </Text>
      </View>
    </View>
  );
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

function navTabLabel(tab: NavTab) {
  if (tab === "home") {
    return "Home";
  }

  if (tab === "premium") {
    return "Premium";
  }

  if (tab === "help") {
    return "Help";
  }

  return "Contact";
}

function AppContent() {
  const [fontsLoaded] = useFonts({
    FrauncesRegular: require("./node_modules/@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf"),
    FrauncesItalic: require("./node_modules/@expo-google-fonts/fraunces/400Regular_Italic/Fraunces_400Regular_Italic.ttf"),
    InterRegular: require("./node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    InterMedium: require("./node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
    InterSemiBold: require("./node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
    InterBold: require("./node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
  });
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [loadingOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const [showLanding, setShowLanding] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [selectedTarget, setSelectedTarget] =
    useState<ExportTarget>("Google Calendar");
  const [importedFile, setImportedFile] = useState<ImportedFile | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parseMode, setParseMode] = useState<"demo" | "live" | null>(null);
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
  const [roadmapTab, setRoadmapTab] = useState<RoadmapTab>("All items");
  const [expandedItemKeys, setExpandedItemKeys] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [notionDatabaseLink, setNotionDatabaseLink] = useState("");
  const [includeBreaks, setIncludeBreaks] = useState(false);

  useEffect(() => {
    if (isImporting || isParsing) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(loadingOpacity, {
            toValue: 0.35,
            duration: 450,
            useNativeDriver: true,
          }),
          Animated.timing(loadingOpacity, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();

      return () => {
        animation.stop();
        loadingOpacity.setValue(1);
      };
    }

    loadingOpacity.setValue(1);
  }, [isImporting, isParsing, loadingOpacity]);

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

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }

      void refreshConnections();
    });

    return () => {
      subscription.remove();
    };
  }, [sessionId]);

  const filteredItems = parsedItems.filter((item) => itemMatchesTab(item, roadmapTab));
  const groupedPreviewItems = Object.entries(groupItemsByDate(filteredItems))
    .sort(([left], [right]) => left.localeCompare(right));
  const notionReady = notionConnected && Boolean(notionDatabaseTitle);
  const exportItemsPreview =
    includeBreaks && isPremiumUnlocked
      ? [...parsedItems, ...inferAcademicBreakItems(parsedItems)]
      : parsedItems;
  const exportReadiness = summarizeExportReadiness(exportItemsPreview);
  const exportBlockedReason =
    selectedTarget === "Google Calendar" && !googleConnected
      ? "Connect Google Calendar before exporting."
      : selectedTarget === "Notion" && !notionConnected
        ? "Connect Notion before exporting."
        : selectedTarget === "Notion" && !notionReady
          ? "Link a Notion database before exporting."
        : null;
  const recentRows = importedFile
    ? [
        {
          course: importedFile.typeLabel,
          title: importedFile.name.replace(/\.[^/.]+$/, ""),
          meta: `${parsedItems.length} event${parsedItems.length === 1 ? "" : "s"} · ${
            parseMode === "live" ? "synced just now" : "needs review"
          }`,
          status: (parseMode === "live" ? "exported" : "review") as
            | "exported"
            | "review",
        },
      ]
    : [];

  const keyForItem = (item: ParsedItem) => `${item.title}__${item.date}__${item.type}`;

  const findItemIndex = (item: ParsedItem) =>
    parsedItems.findIndex(
      (parsedItem) =>
        parsedItem.title === item.title &&
        parsedItem.date === item.date &&
        parsedItem.type === item.type,
    );

  const updateParsedItem = (index: number, updates: Partial<ParsedItem>) => {
    setParsedItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  };

  const removeParsedItem = (index: number) => {
    setParsedItems((current) => {
      const item = current[index];
      if (item) {
        setExpandedItemKeys((expanded) =>
          expanded.filter((key) => key !== keyForItem(item)),
        );
      }

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const addManualItem = () => {
    const newItem: ParsedItem =
      roadmapTab === "Assignments"
        ? {
            title: "New assignment",
            date: "2026-09-01",
            type: "Homework",
            notes: "",
          }
        : roadmapTab === "Exams"
          ? {
              title: "New exam",
              date: "2026-09-01",
              type: "Exam",
              notes: "",
            }
          : {
              title: "New lab or discussion",
              date: "2026-09-01",
              type: "Lab / Discussion",
              notes: "",
          };

    const itemKey = keyForItem(newItem);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setParsedItems((current) => [newItem, ...current]);
    setExpandedItemKeys((current) =>
      current.includes(itemKey) ? current : [itemKey, ...current],
    );
  };

  const applyImportedFile = (file: ImportedFile) => {
    setImportedFile(file);
    setParsedItems([]);
    setParseMode(null);
    setExpandedItemKeys([]);
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
      setParseMode(result.mode);
      setExpandedItemKeys([]);
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
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
          "image/jpeg",
          "image/heic",
          "image/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const nextFile: ImportedFile = {
          name: asset.name || "Syllabus import",
          typeLabel: inferTypeLabel(asset.name, asset.mimeType),
          source: "document",
          uri: asset.uri,
          mimeType: asset.mimeType,
        };
        applyImportedFile(nextFile);
        setIsParsing(true);

        try {
          const parsed = await parseSyllabus(nextFile);
          setParsedItems(parsed.items);
          setParseMode(parsed.mode);
          setExpandedItemKeys([]);
        } catch {
          setParseMode(null);
          Alert.alert("Schedule", "Could not create the schedule.");
        } finally {
          setIsParsing(false);
  }
}

function navTabLabel(tab: NavTab) {
  if (tab === "home") {
    return "Home";
  }

  if (tab === "premium") {
    return "Premium";
  }

  if (tab === "help") {
    return "Help";
  }

  return "Contact";
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
        const nextFile: ImportedFile = {
          name: fileName,
          typeLabel: inferTypeLabel(fileName, asset.mimeType),
          source: "photo",
          uri: asset.uri,
          mimeType: asset.mimeType,
        };
        applyImportedFile(nextFile);
        setIsParsing(true);

        try {
          const parsed = await parseSyllabus(nextFile);
          setParsedItems(parsed.items);
          setParseMode(parsed.mode);
          setExpandedItemKeys([]);
        } catch {
          setParseMode(null);
          Alert.alert("Schedule", "Could not create the schedule.");
        } finally {
          setIsParsing(false);
        }
      }
    } catch {
      Alert.alert("Photo", "Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async (target: ExportTarget) => {
    setSelectedTarget(target);

    if (!parsedItems.length) {
      Alert.alert("Export", "Create the schedule first.");
      return;
    }

    if (exportBlockedReason) {
      Alert.alert("Export", exportBlockedReason);
      return;
    }

    setIsExporting(true);

    try {
      const exportItems = exportItemsPreview;

      if (exportReadiness.missingTitleCount || exportReadiness.invalidDateCount) {
        Alert.alert(
          "Review items first",
          [
            exportReadiness.missingTitleCount
              ? `${exportReadiness.missingTitleCount} item${
                  exportReadiness.missingTitleCount === 1 ? "" : "s"
                } need a title`
              : null,
            exportReadiness.invalidDateCount
              ? `${exportReadiness.invalidDateCount} item${
                  exportReadiness.invalidDateCount === 1 ? "" : "s"
                } have an invalid date`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        return;
      }

      const shouldContinue = await new Promise<boolean>((resolve) => {
        const reviewLines = [
          `${exportItems.length} item${exportItems.length === 1 ? "" : "s"} ready for ${target}.`,
          exportReadiness.suspiciousYearCount
            ? `${exportReadiness.suspiciousYearCount} item${
                exportReadiness.suspiciousYearCount === 1 ? "" : "s"
              } use a year that looks unusual.`
            : null,
          parseMode === "demo"
            ? "These results are fallback/demo-style items, so review carefully."
            : null,
        ]
          .filter(Boolean)
          .join("\n");

        Alert.alert("Confirm export", reviewLines, [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Export",
            onPress: () => resolve(true),
          },
        ]);
      });

      if (!shouldContinue) {
        return;
      }

      if (target === "Apple Calendar") {
        await exportToDeviceCalendar(exportItems);
        Alert.alert("Apple Calendar", "Export complete.");
      } else if (target === "Google Calendar") {
        await beginGoogleExport(exportItems, sessionId);
        Alert.alert("Google Calendar", "Export complete.");
      } else {
        await beginNotionExport(exportItems, sessionId);
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
      <SafeAreaView
        style={[styles.safeArea, activeTab === "home" && styles.homeScreenBackground]}
      >
        <StatusBar style="dark" />
        <View style={[styles.appFrame, activeTab === "home" && styles.homeScreenBackground]}>
          <ScrollView
            style={activeTab === "home" ? styles.homeScreenBackground : undefined}
            contentContainerStyle={[
              styles.scrollContent,
              activeTab === "home" && styles.scrollContentHome,
              isTablet && activeTab !== "home" && styles.scrollContentTablet,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === "home" ? (
              <View
                style={[
                  styles.pageColumn,
                  styles.pageColumnHome,
                  isTablet && activeTab !== "home" && styles.pageColumnTablet,
                ]}
              >
                <View style={styles.homeGradient}>
                  <View style={[styles.homeTopBar, isTablet && styles.homeTopBarTablet]}>
                    <Pressable style={styles.homeTopIconButton}>
                      <IconUser size={18} color={redesignColors.forest} />
                    </Pressable>
                  </View>

                  <View style={[styles.homeHeroBlock, isTablet && styles.homeHeroBlockTablet]}>
                    <View style={styles.homeStatusPill}>
                      <View style={styles.homeStatusDotHalo}>
                        <View style={styles.homeStatusDot} />
                      </View>
                      <Text style={styles.homeStatusText}>FALL '26 READY</Text>
                    </View>

                    <Text style={[styles.homeHeadline, isTablet && styles.homeHeadlineTablet]}>
                      <Text style={styles.homeHeadlineInk}>Your syllabus,{"\n"}</Text>
                      <Text style={styles.homeHeadlineAccent}>on your calendar.</Text>
                    </Text>

                    <Text style={[styles.homeSubhead, isTablet && styles.homeSubheadTablet]}>
                      Drop in a PDF or photo. We&apos;ll find every due date, exam, and
                      reading — review, then send to your calendar.
                    </Text>
                  </View>

                  <View style={[styles.homeUploadWrap, isTablet && styles.homeUploadWrapTablet]}>
                    <View style={styles.homeUploadCard}>
                      <Pressable onPress={handlePickDocument} style={styles.homeDropZone}>
                        <View style={styles.homeDropZoneStripes} />
                        <View style={styles.homeUploadIconTile}>
                          <IconUpload size={24} color={redesignColors.paper} />
                        </View>
                        <View style={styles.homeUploadTextBlock}>
                          <Text style={styles.homeUploadTitle}>Upload syllabus</Text>
                          <Text style={styles.homeUploadCaption}>
                            PDF, DOCX, or photo · up to 20 MB
                          </Text>
                        </View>
                        <View style={styles.homeArrowChip}>
                          <IconArrow size={17} color={redesignColors.forest} />
                        </View>
                      </Pressable>

                      <View style={styles.homeSecondaryGrid}>
                        <SecondaryActionCard
                          icon={<IconCamera size={18} color={redesignColors.forest} />}
                          label="Take photo"
                          hint="Snap a printed page"
                          onPress={handlePickPhoto}
                        />
                        <SecondaryActionCard
                          icon={<IconSparkleLine size={18} color={redesignColors.forest} />}
                          label="Try sample"
                          hint="See how it works"
                          onPress={() => void handleUseExample()}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={[styles.homeRecentSection, isTablet && styles.homeRecentSectionTablet]}>
                    <View style={styles.homeRecentHeader}>
                      <Text style={styles.homeRecentEyebrow}>RECENT</Text>
                      <Pressable>
                        <Text style={styles.homeRecentSeeAll}>See all</Text>
                      </Pressable>
                    </View>

                    {recentRows.length ? (
                      recentRows.map((row) => (
                        <View key={`${row.course}-${row.title}`} style={styles.homeRecentStack}>
                          <RecentRow
                            course={row.course}
                            title={row.title}
                            meta={row.meta}
                            status={row.status}
                          />
                        </View>
                      ))
                    ) : (
                      <View style={styles.homeEmptyRecentRow}>
                        <Text style={styles.homeEmptyRecentText}>
                          No syllabi yet — upload your first one above
                        </Text>
                      </View>
                    )}
                  </View>

                  {(importedFile || isImporting || isParsing) ? (
                    <Animated.Text
                      style={[
                        styles.homeLoadingText,
                        (isImporting || isParsing) && { opacity: loadingOpacity },
                      ]}
                    >
                      {isImporting || isParsing ? "Loading..." : importedFile?.name}
                    </Animated.Text>
                  ) : null}

                  {parseMode === "live" ? (
                    <View style={styles.homeBanner}>
                      <Text style={styles.homeBannerText}>
                        Live parse ready. Review dates before exporting.
                      </Text>
                    </View>
                  ) : null}

                  {parseMode === "demo" ? (
                    <View style={[styles.homeBanner, styles.homeBannerWarning]}>
                      <Text style={styles.homeBannerText}>
                        Showing fallback example-style results. Check each item before export.
                      </Text>
                    </View>
                  ) : null}
                </View>

                {parsedItems.length ? (
                  <>
                  <View style={styles.softDivider} />
                  <View style={styles.contentCard}>
                    <Text style={styles.infoTitle}>Review</Text>

                    <View style={styles.reviewControlStrip}>
                      <View style={styles.segmentedControl}>
                        {roadmapTabs.map((tab) => {
                          const isActive = roadmapTab === tab;

                          return (
                            <Pressable
                              key={tab}
                              onPress={() => {
                                setRoadmapTab(tab);
                              }}
                              style={[
                                styles.segmentedButton,
                                isActive && styles.segmentedButtonActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.segmentedButtonText,
                                  isActive && styles.segmentedButtonTextActive,
                                ]}
                              >
                                {tab}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {filteredItems.length ? (
                      <View style={styles.reviewSection}>
                        <View style={styles.itemListHeader}>
                          <View style={styles.itemListHeaderText}>
                            <Text style={styles.itemListTitle}>Your schedule</Text>
                          </View>
                          <Pressable onPress={addManualItem} hitSlop={8} style={styles.addButton}>
                            <View style={styles.addIcon}>
                              <View style={styles.addIconHorizontal} />
                              <View style={styles.addIconVertical} />
                            </View>
                          </Pressable>
                        </View>
                        {filteredItems.map((item, index) => (
                          <View key={`${item.title}-${item.date}-${index}`} style={styles.itemStack}>
                            <Pressable
                              onPress={() => {
                                const itemKey = keyForItem(item);
                                LayoutAnimation.configureNext({
                                  duration: 180,
                                  create: {
                                    type: LayoutAnimation.Types.easeInEaseOut,
                                    property: LayoutAnimation.Properties.opacity,
                                  },
                                  update: {
                                    type: LayoutAnimation.Types.easeInEaseOut,
                                  },
                                  delete: {
                                    type: LayoutAnimation.Types.easeInEaseOut,
                                    property: LayoutAnimation.Properties.opacity,
                                  },
                                });
                                setExpandedItemKeys((current) =>
                                  current.includes(itemKey)
                                    ? current.filter((key) => key !== itemKey)
                                    : [...current, itemKey],
                                );
                              }}
                              style={[
                                styles.itemRow,
                                expandedItemKeys.includes(keyForItem(item)) &&
                                  styles.itemRowActive,
                              ]}
                            >
                              <View style={styles.previewRowHeader}>
                                <View style={styles.previewTextBlock}>
                                  <Text style={styles.itemTitle}>{item.title}</Text>
                                  <Text style={styles.itemMeta}>
                                    {labelForItemType(item.type)} • {formatDisplayWeekday(item.date)} {formatDisplayDate(item.date)}
                                  </Text>
                                </View>
                                <Pressable
                                  onPress={() => {
                                    const itemIndex = findItemIndex(item);

                                    if (itemIndex >= 0) {
                                      removeParsedItem(itemIndex);
                                    }
                                  }}
                                  hitSlop={8}
                                >
                                  <Text style={styles.deleteText}>x</Text>
                                </Pressable>
                              </View>
                            </Pressable>

                            {expandedItemKeys.includes(keyForItem(item)) && findItemIndex(item) >= 0 ? (
                              <View style={styles.inlineEditorCard}>
                                <Text style={styles.inlineEditorLead}>
                                  {editorDestinationCopy(selectedTarget, notionDatabaseTitle)}
                                </Text>
                                <TextInput
                                  value={item.title}
                                  onChangeText={(text) =>
                                    updateParsedItem(findItemIndex(item), { title: text })
                                  }
                                  placeholder="Title"
                                  placeholderTextColor={palette.textSoft}
                                  style={styles.editorInput}
                                />
                                <TextInput
                                  value={item.date}
                                  onChangeText={(text) =>
                                    updateParsedItem(findItemIndex(item), { date: text })
                                  }
                                  placeholder="YYYY-MM-DD"
                                  placeholderTextColor={palette.textSoft}
                                  style={styles.editorInput}
                                />
                                <TextInput
                                  value={item.notes || ""}
                                  onChangeText={(text) =>
                                    updateParsedItem(findItemIndex(item), { notes: text })
                                  }
                                  placeholder="Notes"
                                  placeholderTextColor={palette.textSoft}
                                  style={[styles.editorInput, styles.editorNotes]}
                                  multiline
                                />
                              </View>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.reviewSection}>
                        <View style={styles.itemListHeader}>
                          <View style={styles.itemListHeaderText}>
                            <Text style={styles.itemListTitle}>Your schedule</Text>
                          </View>
                          <Pressable onPress={addManualItem} hitSlop={8} style={styles.addButton}>
                            <View style={styles.addIcon}>
                              <View style={styles.addIconHorizontal} />
                              <View style={styles.addIconVertical} />
                            </View>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    <View style={styles.reviewSection}>
                      <View style={styles.segmentedControl}>
                        {exportTargets.map((target) => {
                          const isActive = selectedTarget === target;

                          return (
                            <Pressable
                              key={target}
                              onPress={() => setSelectedTarget(target)}
                              style={[
                                styles.segmentedButton,
                                isActive && styles.segmentedButtonActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.segmentedButtonText,
                                  isActive && styles.segmentedButtonTextActive,
                                ]}
                              >
                                {target === "Google Calendar"
                                  ? "Google"
                                  : target === "Apple Calendar"
                                    ? "Apple"
                                    : "Notion"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <Text style={styles.previewTitle}>{selectedTarget}</Text>

                      {filteredItems.length ? (
                        selectedTarget === "Apple Calendar" ? (
                          <View style={styles.previewList}>
                            {filteredItems.map((item, index) => (
                              <View key={`${item.title}-${item.date}-${index}`} style={styles.previewListRow}>
                                <View style={styles.previewTextBlock}>
                                  <Text style={styles.previewPrimaryText}>{item.title}</Text>
                                  <Text style={styles.previewSecondaryText}>
                                    {labelForItemType(item.type)} • {formatDisplayWeekday(item.date)} {formatDisplayDate(item.date)}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : selectedTarget === "Google Calendar" ? (
                          <View style={styles.calendarPreview}>
                            {groupedPreviewItems.map(([date, items]) => (
                              <View key={date} style={styles.calendarDayRow}>
                                <Text style={styles.calendarDate}>{formatDisplayDate(date)}</Text>
                                <View style={styles.calendarItems}>
                                  {items.map((item, index) => (
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
                            {filteredItems.map((item, index) => (
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
                  </View>
                  </>
                ) : null}

                {parsedItems.length ? (
                  <>
                  <View style={styles.softDivider} />
                  <View style={styles.contentCard}>
                    <Pressable
                      onPress={() => handleExport(selectedTarget)}
                      disabled={Boolean(exportBlockedReason) || isExporting}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        styles.exportButton,
                        (Boolean(exportBlockedReason) || isExporting) && styles.buttonDisabled,
                        pressed && styles.primaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.primaryButtonText}>
                        {isExporting ? "Working..." : `Export to ${selectedTarget}`}
                      </Text>
                    </Pressable>

                    {exportBlockedReason ? (
                      <Text style={styles.helperText}>{exportBlockedReason}</Text>
                    ) : null}

                    {!exportBlockedReason ? (
                      <View style={styles.exportSummaryCard}>
                        <Text style={styles.exportSummaryText}>
                          {exportItemsPreview.length} item
                          {exportItemsPreview.length === 1 ? "" : "s"} ready for export
                        </Text>
                        {exportReadiness.reviewCount ? (
                          <Text style={[styles.exportSummaryText, styles.exportSummaryWarningText]}>
                            {exportReadiness.reviewCount} need review before export
                          </Text>
                        ) : (
                          <Text style={styles.exportSummarySubtext}>
                            No title or date issues detected.
                          </Text>
                        )}
                        {parseMode === "demo" ? (
                          <Text style={[styles.exportSummarySubtext, styles.exportSummaryWarningText]}>
                            Fallback/demo parse detected. Double-check every date.
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.connectionList}>
                      <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Google Calendar</Text>
                        {googleConnected ? (
                          <Text style={styles.connectionStatusText}>Connected</Text>
                        ) : (
                          <Pressable
                            onPress={async () => {
                              try {
                                await beginGoogleOAuth(sessionId);
                              } catch (error) {
                                Alert.alert(
                                  "Google Calendar",
                                  error instanceof Error
                                    ? error.message
                                    : "Could not start Google connection.",
                                );
                              }
                            }}
                          >
                            <Text style={styles.connectionAction}>Connect</Text>
                          </Pressable>
                        )}
                      </View>

                      <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Notion</Text>
                        {notionConnected ? (
                          <Text style={styles.connectionStatusText}>Connected</Text>
                        ) : (
                          <Pressable
                            onPress={async () => {
                              try {
                                await beginNotionOAuth(sessionId);
                              } catch (error) {
                                Alert.alert(
                                  "Notion",
                                  error instanceof Error
                                    ? error.message
                                    : "Could not start Notion connection.",
                                );
                              }
                            }}
                          >
                            <Text style={styles.connectionAction}>Connect</Text>
                          </Pressable>
                        )}
                      </View>

                      <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Notion database</Text>
                        <Text style={styles.connectionStatusText}>
                          {notionDatabaseTitle || (notionConnected ? "Not linked" : "Connect first")}
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

                    {isPremiumUnlocked ? (
                      <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Include breaks and holidays</Text>
                        <Pressable onPress={() => setIncludeBreaks((current) => !current)}>
                          <Text style={styles.connectionAction}>
                            {includeBreaks ? "On" : "Off"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {selectedTarget === "Notion" ? (
                      <View style={styles.editorCard}>
                        <Text style={styles.editorTitle}>Notion database</Text>
                        {notionConnected ? (
                          <>
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
                                    error instanceof Error
                                      ? error.message
                                      : "Could not link database.",
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
                            ) : (
                              <Text style={styles.helperText}>
                                Connect Notion, then paste the database link you want to export into.
                              </Text>
                            )}
                          </>
                        ) : (
                          <>
                            <Text style={styles.helperText}>
                              Connect Notion first, then paste a database link here.
                            </Text>
                            <Pressable
                              onPress={async () => {
                                try {
                                  await beginNotionOAuth(sessionId);
                                } catch (error) {
                                  Alert.alert(
                                    "Notion",
                                    error instanceof Error
                                      ? error.message
                                      : "Could not start Notion connection.",
                                  );
                                }
                              }}
                              style={({ pressed }) => [
                                styles.secondaryButton,
                                pressed && styles.secondaryButtonPressed,
                              ]}
                            >
                              <Text style={styles.secondaryButtonText}>Connect Notion</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    ) : null}
                  </View>
                  </>
                ) : null}
              </View>
            ) : null}

            {activeTab === "premium" ? (
              <View style={[styles.pageColumn, styles.secondaryPageColumn]}>
                <View style={styles.secondaryPageHeader}>
                  <Text style={styles.secondaryPageEyebrow}>PREMIUM</Text>
                  <Text style={styles.secondaryPageTitle}>Export everywhere, faster.</Text>
                  <Text style={styles.secondaryPageBody}>
                    Unlock multi-destination exports, premium parsing workflows, and
                    optional academic break handling in one subscription.
                  </Text>
                </View>
                <View style={styles.secondaryPageCard}>
                  <Text style={styles.secondarySectionTitle}>What&apos;s included</Text>
                  <View style={styles.benefitList}>
                    <Text style={styles.benefitText}>Unlimited syllabus uploads</Text>
                    <Text style={styles.benefitText}>Export to multiple destinations</Text>
                    <Text style={styles.benefitText}>Google, Apple, and Notion export</Text>
                    <Text style={styles.benefitText}>Full editing before export</Text>
                    <Text style={styles.benefitText}>Automatic breaks and holiday detection</Text>
                    <Text style={styles.benefitText}>Future attendance tools</Text>
                  </View>
                  <Text style={styles.secondaryInlineNote}>$3.99 per month.</Text>
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
              <View style={[styles.pageColumn, styles.secondaryPageColumn]}>
                <View style={styles.secondaryPageHeader}>
                  <Text style={styles.secondaryPageEyebrow}>CALENDAR WORKSPACE</Text>
                  <Text style={styles.secondaryPageTitle}>Review before you export.</Text>
                  <Text style={styles.secondaryPageBody}>
                    See what was detected, choose a destination, and clean up any dates
                    before sending everything out.
                  </Text>
                </View>
                <View style={styles.secondaryStatsRow}>
                  <View style={styles.secondaryStatCard}>
                    <Text style={styles.secondaryStatValue}>{parsedItems.length}</Text>
                    <Text style={styles.secondaryStatLabel}>events parsed</Text>
                  </View>
                  <View style={styles.secondaryStatCard}>
                    <Text style={styles.secondaryStatValue}>{filteredItems.length}</Text>
                    <Text style={styles.secondaryStatLabel}>in current filter</Text>
                  </View>
                  <View style={styles.secondaryStatCard}>
                    <Text style={styles.secondaryStatValue}>
                      {selectedTarget === "Google Calendar"
                        ? "Google"
                        : selectedTarget === "Apple Calendar"
                          ? "Apple"
                          : "Notion"}
                    </Text>
                    <Text style={styles.secondaryStatLabel}>selected export</Text>
                  </View>
                </View>
                <View style={styles.secondaryPageCard}>
                  <Text style={styles.secondarySectionTitle}>Current status</Text>
                  <View style={styles.helpList}>
                    <Text style={styles.helpText}>
                      {parsedItems.length
                        ? "Your schedule is loaded. Review dates and titles before export."
                        : "No schedule loaded yet. Upload a syllabus from Home or use the scan action first."}
                    </Text>
                    <Text style={styles.helpText}>
                      Switch between assignments, exams, and labs before exporting.
                    </Text>
                    <Text style={styles.helpText}>
                      Connect Google or Notion only if you plan to export there.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setActiveTab("home")}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      styles.secondaryPageButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Back to Home</Text>
                  </Pressable>
                </View>
                <View style={styles.secondaryPageCard}>
                  <Text style={styles.secondarySectionTitle}>How export works</Text>
                  <View style={styles.helpList}>
                    <Text style={styles.helpText}>1. Upload a file, photo, or sample syllabus.</Text>
                    <Text style={styles.helpText}>2. Review every detected event and edit anything missing.</Text>
                    <Text style={styles.helpText}>3. Pick Apple Calendar, Google Calendar, or Notion.</Text>
                    <Text style={styles.helpText}>4. Export only when the dates look right.</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {activeTab === "feedback" ? (
              <View style={[styles.pageColumn, styles.secondaryPageColumn]}>
                <View style={styles.secondaryPageHeader}>
                  <Text style={styles.secondaryPageEyebrow}>LIBRARY</Text>
                  <Text style={styles.secondaryPageTitle}>Notes, support, and feedback.</Text>
                  <Text style={styles.secondaryPageBody}>
                    Keep the guidance close by and send product feedback without leaving
                    the app.
                  </Text>
                </View>
                <View style={styles.secondaryPageCard}>
                  <Text style={styles.secondarySectionTitle}>Quick notes</Text>
                  <View style={styles.helpList}>
                    <Text style={styles.helpText}>Use clear PDFs or well-lit photos for the best parsing.</Text>
                    <Text style={styles.helpText}>Word documents are supported, but always verify the dates.</Text>
                    <Text style={styles.helpText}>If something looks wrong, edit it before export.</Text>
                  </View>
                </View>
                <View style={styles.secondaryPageCard}>
                  <Text style={styles.secondarySectionTitle}>Send feedback</Text>
                  <TextInput
                    value={feedbackText}
                    onChangeText={setFeedbackText}
                    placeholder="Tell us what to improve"
                    placeholderTextColor={redesignColors.inkMute}
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

          {activeTab === "home" ? (
            <View style={styles.homeTrustStrip}>
              <View style={styles.homeTrustItem}>
                <IconLock size={13} color={redesignColors.inkMute} />
                <Text style={styles.homeTrustText}>On-device</Text>
              </View>
              <View style={styles.homeTrustDivider} />
              <View style={styles.homeTrustItem}>
                <IconBolt size={13} color={redesignColors.inkMute} />
                <Text style={styles.homeTrustText}>~7s avg</Text>
              </View>
              <View style={styles.homeTrustDivider} />
              <View style={styles.homeTrustItem}>
                <IconCheck size={13} color={redesignColors.inkMute} />
                <Text style={styles.homeTrustText}>No account</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.navArea}>
            <BlurView intensity={18} tint="light" style={[styles.navShell, isTablet && styles.navShellTablet]}>
              <Pressable
                onPress={() => setActiveTab("home")}
                style={[
                  styles.navButton,
                  activeTab === "home" && styles.navButtonActive,
                  isTablet && styles.navButtonTablet,
                ]}
              >
                <IconHome
                  size={20}
                  color={activeTab === "home" ? redesignColors.paper : redesignColors.inkSoft}
                  strokeWidth={activeTab === "home" ? 1.8 : 1.6}
                />
                <Text
                  style={[
                    styles.navButtonLabel,
                    activeTab === "home" && styles.navButtonLabelActive,
                  ]}
                >
                  Home
                </Text>
              </Pressable>
              <Pressable
                onPress={handlePickPhoto}
                style={[styles.navButton, isTablet && styles.navButtonTablet]}
              >
                <IconSparkleLine size={20} color={redesignColors.inkSoft} />
                <Text style={styles.navButtonLabel}>Scan</Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("help")}
                style={[styles.navButton, activeTab === "help" && styles.navButtonActive, isTablet && styles.navButtonTablet]}
              >
                <IconCalendar
                  size={20}
                  color={activeTab === "help" ? redesignColors.paper : redesignColors.inkSoft}
                  strokeWidth={activeTab === "help" ? 1.8 : 1.6}
                />
                <Text
                  style={[
                    styles.navButtonLabel,
                    activeTab === "help" && styles.navButtonLabelActive,
                  ]}
                >
                  Calendar
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("feedback")}
                style={[
                  styles.navButton,
                  activeTab === "feedback" && styles.navButtonActive,
                  isTablet && styles.navButtonTablet,
                ]}
              >
                <IconLibrary
                  size={20}
                  color={activeTab === "feedback" ? redesignColors.paper : redesignColors.inkSoft}
                  strokeWidth={activeTab === "feedback" ? 1.8 : 1.6}
                />
                <Text
                  style={[
                    styles.navButtonLabel,
                    activeTab === "feedback" && styles.navButtonLabelActive,
                  ]}
                >
                  Library
                </Text>
              </Pressable>
            </BlurView>
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
    fontFamily: "FrauncesRegular",
    fontSize: 36,
    lineHeight: 40,
    textAlign: "center",
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  homeScreenBackground: {
    backgroundColor: redesignColors.paper,
  },
  appFrame: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingTop: 24,
    paddingBottom: 48,
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  scrollContentHome: {
    justifyContent: "flex-start",
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 24,
  },
  scrollContentTablet: {
    justifyContent: "flex-start",
    paddingTop: 72,
    paddingBottom: 72,
    paddingHorizontal: 32,
  },
  pageColumn: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 14,
  },
  pageColumnHome: {
    maxWidth: "100%",
    gap: 0,
  },
  pageColumnTablet: {
    maxWidth: 980,
    gap: 18,
  },
  secondaryPageColumn: {
    maxWidth: 760,
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 120,
    gap: 16,
  },
  secondaryPageHeader: {
    gap: 8,
    paddingHorizontal: 8,
  },
  secondaryPageEyebrow: {
    color: redesignColors.inkMute,
    fontFamily: "InterSemiBold",
    fontSize: 11,
    letterSpacing: 1.1,
  },
  secondaryPageTitle: {
    color: redesignColors.forestDeep,
    fontFamily: "FrauncesRegular",
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  secondaryPageBody: {
    maxWidth: 540,
    color: redesignColors.inkSoft,
    fontFamily: "InterRegular",
    fontSize: 14,
    lineHeight: 21,
  },
  secondaryStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryStatCard: {
    flex: 1,
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: redesignColors.hairline,
    backgroundColor: "rgba(255,255,255,0.42)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "space-between",
  },
  secondaryStatValue: {
    color: redesignColors.forestDeep,
    fontFamily: "FrauncesRegular",
    fontSize: 24,
    lineHeight: 26,
  },
  secondaryStatLabel: {
    color: redesignColors.inkMute,
    fontFamily: "InterMedium",
    fontSize: 11.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  secondaryPageCard: {
    width: "100%",
    backgroundColor: redesignColors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: redesignColors.hairline,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
    shadowColor: redesignColors.forestShadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
  },
  secondarySectionTitle: {
    color: redesignColors.forestDeep,
    fontFamily: "FrauncesRegular",
    fontSize: 24,
    lineHeight: 27,
  },
  secondaryInlineNote: {
    color: redesignColors.inkMute,
    fontFamily: "InterRegular",
    fontSize: 13,
    textAlign: "left",
  },
  secondaryPageButton: {
    alignSelf: "flex-start",
    minWidth: 148,
  },
  homeGradient: {
    width: "100%",
    minHeight: "100%",
    backgroundColor: redesignColors.paper,
    paddingBottom: 32,
  },
  homeTopBar: {
    paddingTop: 58,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  homeTopBarTablet: {
    paddingTop: 20,
    paddingHorizontal: 56,
  },
  homeTopIconButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: redesignColors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  homeHeroBlock: {
    paddingTop: 24,
    paddingHorizontal: 22,
    alignItems: "flex-start",
  },
  homeHeroBlockTablet: {
    paddingTop: 44,
    paddingHorizontal: 56,
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
  },
  homeStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(40,88,59,0.07)",
    borderWidth: 1,
    borderColor: "rgba(40,88,59,0.15)",
  },
  homeStatusDotHalo: {
    width: 12,
    height: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(217,178,90,0.25)",
  },
  homeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: redesignColors.gold,
  },
  homeStatusText: {
    color: redesignColors.forest,
    fontFamily: "InterSemiBold",
    fontSize: 11,
    letterSpacing: 0.66,
  },
  homeHeadline: {
    marginTop: 14,
    color: redesignColors.forestShadow,
    fontFamily: "FrauncesRegular",
    fontSize: 39,
    lineHeight: 40,
    letterSpacing: -0.9,
  },
  homeHeadlineTablet: {
    fontSize: 72,
    lineHeight: 74,
  },
  homeHeadlineInk: {
    color: redesignColors.forestShadow,
    fontFamily: "FrauncesRegular",
  },
  homeHeadlineAccent: {
    color: redesignColors.forest,
    fontFamily: "FrauncesItalic",
  },
  homeSubhead: {
    marginTop: 10,
    maxWidth: 320,
    color: redesignColors.inkSoft,
    fontFamily: "InterRegular",
    fontSize: 14,
    lineHeight: 21,
  },
  homeSubheadTablet: {
    maxWidth: 520,
    fontSize: 18,
    lineHeight: 28,
  },
  homeUploadWrap: {
    paddingTop: 20,
    paddingHorizontal: 22,
  },
  homeUploadWrapTablet: {
    paddingTop: 32,
    paddingHorizontal: 56,
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
  },
  homeUploadCard: {
    backgroundColor: redesignColors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: redesignColors.hairline,
    padding: 16,
    shadowColor: redesignColors.forestShadow,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  homeDropZone: {
    minHeight: 96,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: redesignColors.hairline,
    paddingHorizontal: 16,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
  },
  homeDropZoneStripes: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(40,88,59,0.02)",
  },
  homeUploadIconTile: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: redesignColors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  homeUploadTextBlock: {
    flex: 1,
    gap: 2,
  },
  homeUploadTitle: {
    color: redesignColors.ink,
    fontFamily: "InterSemiBold",
    fontSize: 15,
  },
  homeUploadCaption: {
    color: redesignColors.inkMute,
    fontFamily: "InterRegular",
    fontSize: 12,
  },
  homeArrowChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(40,88,59,0.15)",
    backgroundColor: "rgba(40,88,59,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  homeSecondaryGrid: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  homeSecondaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: redesignColors.hairline,
    backgroundColor: redesignColors.paper,
  },
  homeSecondaryIconTile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(40,88,59,0.08)",
  },
  homeSecondaryText: {
    flex: 1,
  },
  homeSecondaryLabel: {
    color: redesignColors.ink,
    fontFamily: "InterSemiBold",
    fontSize: 13.5,
  },
  homeSecondaryHint: {
    color: redesignColors.inkMute,
    fontFamily: "InterRegular",
    fontSize: 11,
    marginTop: 1,
  },
  homeRecentSection: {
    paddingTop: 20,
    paddingHorizontal: 22,
  },
  homeRecentSectionTablet: {
    paddingTop: 26,
    paddingHorizontal: 56,
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
  },
  homeRecentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  homeRecentEyebrow: {
    color: redesignColors.inkMute,
    fontFamily: "InterSemiBold",
    fontSize: 11,
    letterSpacing: 1.1,
  },
  homeRecentSeeAll: {
    color: redesignColors.forest,
    fontFamily: "InterSemiBold",
    fontSize: 12,
  },
  homeRecentStack: {
    marginBottom: 8,
  },
  homeRecentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: redesignColors.hairlineSoft,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  homeRecentFileTile: {
    width: 38,
    height: 44,
    borderRadius: 8,
    backgroundColor: redesignColors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  homeRecentBody: {
    flex: 1,
  },
  homeRecentHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 1,
  },
  homeRecentCourse: {
    color: redesignColors.forest,
    fontFamily: "InterBold",
    fontSize: 11,
    letterSpacing: 0.44,
  },
  homeRecentTitle: {
    flex: 1,
    color: redesignColors.ink,
    fontFamily: "InterSemiBold",
    fontSize: 13.5,
  },
  homeRecentMeta: {
    color: redesignColors.inkMute,
    fontFamily: "InterRegular",
    fontSize: 11.5,
  },
  homeRecentBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  homeRecentBadgeExported: {
    backgroundColor: "rgba(40,88,59,0.08)",
    borderColor: "rgba(40,88,59,0.18)",
  },
  homeRecentBadgeReview: {
    backgroundColor: "rgba(217,178,90,0.18)",
    borderColor: "rgba(184,146,59,0.35)",
  },
  homeRecentBadgeText: {
    fontFamily: "InterBold",
    fontSize: 10.5,
    letterSpacing: 0.63,
    textTransform: "uppercase",
  },
  homeRecentBadgeTextExported: {
    color: redesignColors.forest,
  },
  homeRecentBadgeTextReview: {
    color: redesignColors.goldDeep,
  },
  homeEmptyRecentRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: redesignColors.hairlineSoft,
    backgroundColor: "rgba(255,255,255,0.5)",
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  homeEmptyRecentText: {
    color: redesignColors.inkMute,
    fontFamily: "InterRegular",
    fontSize: 12.5,
  },
  homeLoadingText: {
    marginTop: 8,
    color: redesignColors.inkMute,
    fontFamily: "InterRegular",
    fontSize: 12,
    textAlign: "center",
  },
  homeBanner: {
    marginTop: 10,
    marginHorizontal: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: redesignColors.hairline,
    backgroundColor: redesignColors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  homeBannerWarning: {
    borderColor: "rgba(184,146,59,0.35)",
    backgroundColor: "rgba(217,178,90,0.12)",
  },
  homeBannerText: {
    color: redesignColors.ink,
    fontFamily: "InterRegular",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  homeTrustStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 8,
    flexWrap: "wrap",
  },
  homeTrustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  homeTrustText: {
    color: redesignColors.inkMute,
    fontFamily: "InterRegular",
    fontSize: 11.5,
  },
  homeTrustDivider: {
    width: 1,
    height: 12,
    backgroundColor: redesignColors.hairline,
  },
  homePanel: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 20,
  },
  homePanelTablet: {
    borderRadius: 30,
    paddingHorizontal: 28,
    paddingVertical: 24,
    gap: 24,
    maxWidth: 760,
    alignSelf: "center",
  },
  heroTitle: {
    color: palette.text,
    fontSize: 30,
    lineHeight: 34,
    fontFamily: "FrauncesRegular",
    textAlign: "center",
  },
  heroTitleTablet: {
    fontSize: 42,
    lineHeight: 46,
  },
  heroBody: {
    color: palette.textSoft,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: sansFont,
    textAlign: "center",
  },
  heroBodyTablet: {
    fontSize: 18,
    lineHeight: 24,
  },
  heroCard: {
    width: "100%",
    padding: 0,
    gap: 12,
    alignItems: "stretch",
  },
  heroCardTablet: {
    gap: 12,
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
    fontFamily: "FrauncesRegular",
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
  groupedListCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
  },
  actionListRow: {
    width: "100%",
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  actionListRowTablet: {
    paddingVertical: 18,
  },
  groupedListRowLast: {
    borderBottomWidth: 0,
  },
  actionListLabel: {
    color: palette.forest,
    fontFamily: sansFont,
    fontSize: 15,
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
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  secondaryButton: {
    backgroundColor: palette.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
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
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 15,
    fontWeight: "600",
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
    marginTop: 2,
  },
  statusBanner: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  statusBannerWarning: {
    backgroundColor: "#F3E8D5",
    borderColor: "#D8C48F",
  },
  statusBannerText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  contentCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
    alignItems: "stretch",
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
    fontFamily: "FrauncesRegular",
    fontSize: 21,
    lineHeight: 25,
    textAlign: "center",
  },
  reviewIntro: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  reviewControlStrip: {
    width: "100%",
    gap: 14,
    paddingTop: 2,
    alignItems: "center",
  },
  segmentedControl: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    padding: 6,
    backgroundColor: palette.surfaceSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segmentedButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentedButtonActive: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segmentedButtonText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    fontWeight: "600",
  },
  segmentedButtonTextActive: {
    color: palette.forest,
  },
  centeredControlRow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 18,
  },
  navRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
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
    alignItems: "stretch",
  },
  reviewSection: {
    width: "100%",
    gap: 10,
    paddingTop: 4,
  },
  previewHeader: {
    width: "100%",
    gap: 6,
    alignItems: "stretch",
  },
  previewTitle: {
    color: palette.text,
    fontFamily: "FrauncesRegular",
    fontSize: 22,
    lineHeight: 26,
    textAlign: "center",
    alignSelf: "center",
  },
  previewList: {
    width: "100%",
    gap: 8,
  },
  previewListRow: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 3,
  },
  previewRowHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  previewTextBlock: {
    flex: 1,
    gap: 3,
  },
  previewPrimaryText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
    textAlign: "left",
  },
  previewSecondaryText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "left",
  },
  deleteText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 18,
    lineHeight: 18,
  },
  calendarPreview: {
    width: "100%",
    gap: 8,
  },
  calendarDayRow: {
    width: "100%",
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  calendarDate: {
    minWidth: 48,
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
  itemListHeader: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    minHeight: 34,
  },
  itemListHeaderText: {
    alignItems: "center",
    gap: 0,
  },
  itemListTitle: {
    color: palette.text,
    fontFamily: "FrauncesRegular",
    fontSize: 18,
    lineHeight: 21,
    textAlign: "center",
  },
  addButton: {
    position: "absolute",
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  addIcon: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addIconHorizontal: {
    position: "absolute",
    width: 12,
    height: 2,
    borderRadius: 999,
    backgroundColor: palette.forest,
  },
  addIconVertical: {
    position: "absolute",
    width: 2,
    height: 12,
    borderRadius: 999,
    backgroundColor: palette.forest,
  },
  itemStack: {
    width: "100%",
    gap: 8,
  },
  itemRow: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 5,
  },
  itemRowActive: {
    borderWidth: 1,
    borderColor: palette.forest,
  },
  itemTitle: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 14,
    textAlign: "left",
  },
  itemMeta: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "left",
  },
  emptyStateText: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  editorCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
    alignItems: "center",
  },
  inlineEditorCard: {
    width: "100%",
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
    alignItems: "stretch",
  },
  inlineEditorLead: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "left",
  },
  editorTitle: {
    color: palette.text,
    fontFamily: "FrauncesRegular",
    fontSize: 18,
    lineHeight: 21,
    textAlign: "center",
  },
  editorInput: {
    width: "100%",
    backgroundColor: palette.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  exportButton: {
    alignSelf: "stretch",
    marginTop: 2,
  },
  exportSummaryCard: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 4,
    alignItems: "center",
  },
  exportSummaryText: {
    color: palette.text,
    fontFamily: sansFont,
    fontSize: 13,
    textAlign: "center",
  },
  exportSummarySubtext: {
    color: palette.textSoft,
    fontFamily: sansFont,
    fontSize: 12,
    textAlign: "center",
  },
  exportSummaryWarningText: {
    color: palette.forest,
    fontWeight: "600",
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
    backgroundColor: palette.surfaceSoft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
  },
  connectionRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  softDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(226, 215, 195, 0.8)",
  },
  benefitList: {
    gap: 10,
    alignItems: "stretch",
  },
  benefitText: {
    color: redesignColors.ink,
    fontFamily: "InterRegular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "left",
  },
  helpList: {
    gap: 12,
    alignItems: "stretch",
  },
  helpText: {
    color: redesignColors.ink,
    fontFamily: "InterRegular",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "left",
  },
  feedbackInput: {
    minHeight: 140,
    textAlignVertical: "top",
  },
  navShell: {
    marginHorizontal: 16,
    marginBottom: 22,
    overflow: "hidden",
    backgroundColor: "rgba(245,239,220,0.85)",
    borderWidth: 1,
    borderColor: redesignColors.hairline,
    borderRadius: 22,
    padding: 6,
    flexDirection: "row",
    gap: 4,
  },
  navShellTablet: {
    maxWidth: 480,
    alignSelf: "center",
    width: "100%",
  },
  navArea: {
    backgroundColor: "transparent",
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 6,
  },
  navButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 9,
  },
  navButtonTablet: {
    minHeight: 58,
  },
  navButtonActive: {
    backgroundColor: redesignColors.forest,
  },
  navButtonLabel: {
    color: redesignColors.inkSoft,
    fontFamily: "InterMedium",
    fontSize: 10.5,
  },
  navButtonLabelActive: {
    color: redesignColors.paper,
  },
  iconBox: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: {
    fontSize: 20,
    lineHeight: 20,
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
    width: 16,
    height: 11,
    borderWidth: 2,
    borderTopWidth: 0,
  },
  iconBook: {
    width: 18,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
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
    width: 20,
    height: 14,
    borderWidth: 2,
    borderRadius: 3,
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
