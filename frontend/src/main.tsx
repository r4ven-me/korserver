import {
  Activity,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eraser,
  Eye,
  FileDiff,
  FileSliders,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Network,
  Pencil,
  Play,
  Plus,
  Power,
  QrCode,
  RadioTower,
  RefreshCw,
  Route,
  Save,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Square,
  Sun,
  Terminal,
  Trash2,
  Unplug,
  Upload,
  Users,
  Wand2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  applyNft,
  changePassword,
  cleanupNft,
  confirmTotp,
  connectUpstream,
  connectUpstreamProfile,
  createCertificate,
  createP12,
  createUser,
  deleteGroupPolicy,
  deleteGroup,
  deleteGroupConfig,
  deleteOidcProvider,
  deleteUpstreamProfile,
  deleteUser,
  disableTotp,
  disconnectUpstream,
  disconnectUpstreamProfile,
  fetchConfig,
  fetchConfigDiff,
  fetchConfigSource,
  fetchAuthInfo,
  fetchCertificateStatus,
  fetchDiagnostics,
  fetchDomains,
  fetchHealth,
  fetchGroups,
  fetchGroupConfig,
  fetchIdentity,
  fetchInterfaceStats,
  fetchInternalDnsStatus,
  fetchLog,
  fetchLogFiles,
  fetchLogRotationSettings,
  fetchNft,
  fetchOtpQr,
  fetchOtpRecords,
  fetchP12,
  fetchRevokedCertificates,
  fetchUserCert,
  fetchUserKey,
  fetchRenderedConfig,
  fetchServerProcesses,
  fetchRoutes,
  fetchServerStatus,
  fetchSessions,
  fetchSoftwareVersions,
  fetchTotpStatus,
  fetchUpstreamProfiles,
  fetchUpstreamStatus,
  fetchUsers,
  fetchUserConfig,
  issueLetsEncryptCertificate,
  kickSession,
  login,
  logout as logoutSession,
  refreshInternalDnsBlocklist,
  reloadRouting,
  reloadServer,
  restartServer,
  renewLetsEncryptCertificate,
  regenerateCa,
  revokeCaCertificateB64,
  revokeCaCertificateFile,
  saveAuthMethodsSettings,
  saveCertificateSettings,
  saveGeneralSettings,
  saveGroupPolicy,
  saveGroupConfig,
  saveIdentitySettings,
  saveInternalDnsSettings,
  saveLetsEncryptSettings,
  saveLogRotationSettings,
  runLogRotation,
  saveOidcProvider,
  saveOidcSettings,
  saveRoutingSettings,
  saveServerSettings,
  saveUserConfig,
  saveUserGroups,
  saveUpstreamProfile,
  saveUpstreamSettings,
  saveWebSettings,
  setCsrfToken,
  revokeCertificate,
  saveConfigSource,
  setDomains,
  setOtp,
  setRoutes,
  setupTotp,
  setUpstreamProfileEnabled,
  setUserEnabled,
  deleteUserConfig,
  startServer,
  stopServer,
  switchUpstream,
  uploadExternalCertificates,
  uploadCa,
  validateConfigSource,
  writeRenderedConfig,
  type AuthInfo,
  type CertificatePathStatus,
  type CertificateStatus,
  type CommandResult,
  type ConfigSource,
  type DiagnosticResult,
  type Health,
  type GroupPolicyDraft,
  type GroupConfigRecord,
  type IdentityStatus,
  type InterfaceStats,
  type IntervalUnit,
  type InternalDnsStatus,
  type LogFile,
  type LogRotationSettings,
  type LogTail,
  type OtpRecord,
  type OidcProviderDraft,
  type ProcessStatus,
  type RevokedCertificate,
  type SoftwareVersion,
  type SessionRecord,
  type TotpSetup,
  type UpstreamProfile,
  type UpstreamProfileDraft,
  type UpstreamStatus,
  type UserConfig,
  type UserRecord
} from "./api";
import "./styles.css";

const TerminalView = lazy(() =>
  import("./TerminalView").then((module) => ({ default: module.TerminalView }))
);

type Tab =
  | "dashboard"
  | "users"
  | "groups"
  | "sessions"
  | "config"
  | "diagnostics"
  | "logs"
  | "terminal";

type ConfigSection =
  | "system"
  | "server"
  | "auth"
  | "certificates"
  | "identity"
  | "internal_dns"
  | "upstream"
  | "web"
  | "advanced";

// "routing" is no longer its own nav section (its settings live inside the
// "upstream" section, see the config section render block) but is kept as
// a distinct command-output/busy key so its nftables/route actions don't
// clobber upstream's own last-command panel.
type CommandOutputKey = Tab | ConfigSection | "routing";

const configSections: Array<{ id: ConfigSection; label: string }> = [
  { id: "system", label: "System" },
  { id: "server", label: "Server" },
  { id: "certificates", label: "Certificates" },
  { id: "auth", label: "Authentication" },
  { id: "identity", label: "Identity" },
  { id: "upstream", label: "Upstream" },
  { id: "internal_dns", label: "Internal DNS" },
  { id: "web", label: "Web / API" },
  { id: "advanced", label: "Advanced" }
];

type Theme = "light" | "dark";

type Notice = {
  kind: "ok" | "warning" | "error";
  text: string;
} | null;

type P12Draft = {
  passphrase: string;
  appleCompatible: boolean;
};

type OidcDraft = {
  enabled: boolean;
  connector: "pam" | "radius";
  pamService: string;
  pamGidMin: string;
  radiusConfigFile: string;
  radiusGroupconfig: boolean;
  radiusNasIdentifier: string;
  radiusGroupSeparator: "semicolon" | "comma";
};

type CommandOutput = CommandResult | CommandResult[] | null;

type SessionRates = Record<string, { download: string | null; upload: string | null }>;

type SessionSample = {
  rxBytes: number | null;
  txBytes: number | null;
  timestamp: number;
};

type InterfaceSample = {
  rxBytes: number;
  txBytes: number;
  timestamp: number;
};

type InterfaceRatePoint = {
  rx: number;
  tx: number;
};

const INTERFACE_HISTORY_CAP = 180;

type UserConfigModalState = {
  username: string;
  draft: UserConfig;
} | null;

type GroupConfigModalState = {
  name: string;
  draft: UserConfig;
} | null;

type UserGroupsModalState = {
  username: string;
  groups: string[];
} | null;

type GroupMembersModalState = {
  name: string;
  users: string[];
} | null;

type P12Base64ModalState = {
  username: string;
  base64: string;
} | null;

type RevokedCertsModalState = {
  loading: boolean;
  certificates: RevokedCertificate[];
} | null;

type AppState = {
  health: Health | null;
  serverStatus: CommandResult | null;
  serverProcesses: ProcessStatus[];
  users: UserRecord[];
  groups: GroupConfigRecord[];
  otpRecords: OtpRecord[];
  sessions: SessionRecord[];
  routes: string[];
  domains: string[];
  upstream: UpstreamStatus | null;
  upstreamProfiles: UpstreamProfile[];
  identity: IdentityStatus | null;
  internalDns: InternalDnsStatus | null;
  config: Record<string, unknown> | null;
  configSource: ConfigSource | null;
  renderedConfig: Record<string, string>;
  diagnostics: DiagnosticResult | null;
  logFiles: LogFile[];
  certificateStatus: CertificateStatus | null;
  softwareVersions: SoftwareVersion[];
};

const themeStorageKey = "korserver.theme";

const emptyState: AppState = {
  health: null,
  serverStatus: null,
  serverProcesses: [],
  users: [],
  groups: [],
  otpRecords: [],
  sessions: [],
  routes: [],
  domains: [],
  upstream: null,
  upstreamProfiles: [],
  identity: null,
  internalDns: null,
  config: null,
  configSource: null,
  renderedConfig: {},
  diagnostics: null,
  logFiles: [],
  certificateStatus: null,
  softwareVersions: []
};

const emptyUserConfig: UserConfig = {
  dns: [],
  nbns: [],
  split_dns: [],
  routes: [],
  no_routes: [],
  iroutes: [],
  ipv4_network: null,
  ipv4_netmask: null,
  ipv6_network: null,
  ipv6_subnet_prefix: null,
  explicit_ipv4: null,
  explicit_ipv6: null,
  rx_data_per_sec: null,
  tx_data_per_sec: null,
  net_priority: null,
  deny_roaming: null,
  no_udp: null,
  keepalive: null,
  dpd: null,
  mobile_dpd: null,
  max_same_clients: null,
  tunnel_all_dns: null,
  restrict_user_to_routes: null,
  stats_report_time: null,
  mtu: null,
  idle_timeout: null,
  mobile_idle_timeout: null,
  restrict_user_to_ports: null,
  session_timeout: null,
  hostname: null
};

const emptyUpstreamProfileDraft: UpstreamProfileDraft = {
  name: "",
  server: "",
  port: "443",
  interface: "",
  auth_type: "password",
  trusted_cert: false,
  username: "",
  password: "",
  cert_file: "",
  cert_file_base64: "",
  key_file: "",
  key_file_base64: "",
  cert_pass: "",
  server_cert_pin: "",
  check_host: "",
  camouflage_secret: "",
  enable: true,
  enabled: true
};

function upstreamProfileToDraft(profile: UpstreamProfile): UpstreamProfileDraft {
  return {
    name: profile.name,
    server: profile.server,
    port: profile.port,
    interface: profile.interface ?? "",
    auth_type: profile.auth_type,
    trusted_cert: profile.trusted_cert ?? false,
    username: profile.username ?? "",
    password: "",
    cert_file: profile.cert_file ?? "",
    cert_file_base64: "",
    key_file: profile.key_file ?? "",
    key_file_base64: "",
    cert_pass: "",
    server_cert_pin: profile.server_cert_pin ?? "",
    check_host: profile.check_host ?? "",
    // write-only, never sent back by the API (same as password/cert_pass);
    // leaving it blank on save keeps whatever secret is already stored.
    camouflage_secret: "",
    enable: true,
    enabled: profile.enabled
  };
}

const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "config", label: "Config", icon: FileSliders },
  { id: "users", label: "Users", icon: Users },
  { id: "groups", label: "Groups", icon: ShieldCheck },
  { id: "sessions", label: "Sessions", icon: Server },
  { id: "diagnostics", label: "Diagnostics", icon: Network },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "terminal", label: "Terminal", icon: Terminal }
];

function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [configSection, setConfigSection] = useState<ConfigSection>("server");
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem(themeStorageKey);
    return stored === "dark" ? "dark" : "light";
  });
  const [dryRun, setDryRun] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>("session");
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "", totpCode: "" });
  const [loginTotpRequired, setLoginTotpRequired] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "" });
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [p12Drafts, setP12Drafts] = useState<Record<string, P12Draft>>({});
  const [userConfigModal, setUserConfigModal] = useState<UserConfigModalState>(null);
  const [groupConfigModal, setGroupConfigModal] = useState<GroupConfigModalState>(null);
  const [userGroupsModal, setUserGroupsModal] = useState<UserGroupsModalState>(null);
  const [groupMembersModal, setGroupMembersModal] = useState<GroupMembersModalState>(null);
  const [p12Base64Modal, setP12Base64Modal] = useState<P12Base64ModalState>(null);
  const [revokedCertsModal, setRevokedCertsModal] = useState<RevokedCertsModalState>(null);
  const [newGroupName, setNewGroupName] = useState("devops");
  const [externalCertFiles, setExternalCertFiles] = useState<{
    serverCert: File | null;
    serverKey: File | null;
    caCert: File | null;
  }>({ serverCert: null, serverKey: null, caCert: null });
  const [caFiles, setCaFiles] = useState<{ caCert: File | null; caKey: File | null }>({
    caCert: null,
    caKey: null
  });
  const [caRevokeDraft, setCaRevokeDraft] = useState<{
    certificateB64: string;
    certificateFile: File | null;
  }>({ certificateB64: "", certificateFile: null });
  const [certificateSettingsDraft, setCertificateSettingsDraft] = useState<{
    mode: "auto" | "external";
    caName: string;
  }>({ mode: "auto", caName: "Korvus Server CA" });
  const [letsEncryptDraft, setLetsEncryptDraft] = useState({
    enabled: false,
    email: "",
    domains: "",
    staging: false,
    reload: true,
    autoRenew: true,
    interval: 7,
    intervalUnit: "days" as IntervalUnit,
    http01Address: "",
    http01Port: 80
  });
  const [logRotationDraft, setLogRotationDraft] = useState<LogRotationSettings>({
    enabled: false,
    max_size_mb: 50,
    max_age: 0,
    max_age_unit: "days",
    keep_files: 5
  });
  const [routingDraft, setRoutingDraft] = useState({
    mode: "full",
    tunnelDns: false,
    hostTraffic: false,
    dnsmasqListen: "10.10.10.1",
    dnsmasqPort: 53,
    mainInterface: "auto",
    fwmark: "0x0c01",
    tableId: 1201,
    nftPrefix: "korserver"
  });
  const [internalDnsDraft, setInternalDnsDraft] = useState({
    enabled: false,
    domainsText: "",
    filesText: "",
    urlsText: "",
    cacheSize: 150,
    logQueries: false,
    localRecordsText: ""
  });
  const [serverSettingsDraft, setServerSettingsDraft] = useState<ServerSettingsDraft>(() =>
    readServerSettingsDraft({})
  );
  const [authMethodsDraft, setAuthMethodsDraft] = useState<AuthMethodsDraft>(() =>
    readAuthMethodsDraft({})
  );
  const [webSettingsDraft, setWebSettingsDraft] = useState<WebSettingsDraft>(() =>
    readWebSettingsDraft({})
  );
  const [generalSettingsDraft, setGeneralSettingsDraft] = useState<GeneralSettingsDraft>(() =>
    readGeneralSettingsDraft({})
  );
  const [oidcDraft, setOidcDraft] = useState<OidcDraft>({
    enabled: false,
    connector: "pam",
    pamService: "ocserv",
    pamGidMin: "1000",
    radiusConfigFile: "/etc/radiusclient/radiusclient.conf",
    radiusGroupconfig: true,
    radiusNasIdentifier: "",
    radiusGroupSeparator: "semicolon"
  });
  const [identitySettingsDraft, setIdentitySettingsDraft] = useState({
    selectGroupByUrl: false,
    defaultSelectGroup: "",
    defaultGroupConfig: ""
  });
  const [oidcProviderDraft, setOidcProviderDraft] = useState<OidcProviderDraft>({
    name: "keycloak",
    issuer_url: "",
    client_id: "",
    client_secret: "",
    scopes: ["openid", "profile", "email"],
    username_claim: "preferred_username",
    groups_claim: "groups",
    allowed_groups: []
  });
  const [groupPolicyDraft, setGroupPolicyDraft] = useState<GroupPolicyDraft>({
    name: "devops",
    display_name: "",
    routes: "",
    no_routes: "",
    dns: "",
    split_dns: "",
    tunnel_all_dns: false,
    max_same_clients: "",
    session_timeout: "",
    idle_timeout: "",
    no_udp: false
  });
  const [upstreamDraft, setUpstreamDraft] = useState<UpstreamProfileDraft>(emptyUpstreamProfileDraft);
  // Fixed at the moment the dialog opens (create vs. edit an existing
  // profile) -- must NOT be derived from draft.name, which changes on
  // every keystroke and would flip a brand-new profile into "edit mode"
  // (disabling the Name field, see UpstreamProfileDialog) after the very
  // first character typed.
  const [editingUpstreamProfile, setEditingUpstreamProfile] = useState(false);
  // Bumped each time the dialog opens (create or edit) so
  // UpstreamProfileDialog remounts with fresh local state (certMode,
  // keyMode, ...) when switching targets, WITHOUT remounting -- and
  // dropping input focus -- on every keystroke the way keying off the
  // live-typed draft.name did.
  const [upstreamDialogKey, setUpstreamDialogKey] = useState(0);
  const [upstreamModalOpen, setUpstreamModalOpen] = useState(false);
  const [upstreamSettingsModalOpen, setUpstreamSettingsModalOpen] = useState(false);
  const [upstreamInterface, setUpstreamInterface] = useState("oc-middle0");
  const [upstreamCheckInterval, setUpstreamCheckInterval] = useState(5);
  const [upstreamCheckThreshold, setUpstreamCheckThreshold] = useState(3);
  const [upstreamFailover, setUpstreamFailover] = useState(false);
  const [upstreamCheckHost, setUpstreamCheckHost] = useState("");
  const [logRequest, setLogRequest] = useState({ name: "supervisord.log", lines: 100 });
  const [liveLog, setLiveLog] = useState(false);
  const [logTail, setLogTail] = useState<LogTail | null>(null);
  const [configDraft, setConfigDraft] = useState("");
  const [configDirty, setConfigDirty] = useState(false);
  const [configDiff, setConfigDiff] = useState("");
  const [configValidation, setConfigValidation] = useState("");
  const [state, setState] = useState<AppState>(emptyState);
  const [sessionRates, setSessionRates] = useState<SessionRates>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [noticePaused, setNoticePaused] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [commandOutputs, setCommandOutputs] = useState<
    Partial<Record<CommandOutputKey, CommandOutput>>
  >({});
  const sessionSamplesRef = useRef<Record<string, SessionSample>>({});
  const interfaceSampleRef = useRef<InterfaceSample | null>(null);
  const [interfaceName, setInterfaceName] = useState<string | null>(null);
  const [interfaceHistory, setInterfaceHistory] = useState<InterfaceRatePoint[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!notice || noticePaused) {
      return;
    }
    const timeout = window.setTimeout(() => setNotice(null), notice.kind === "error" ? 8000 : 5000);
    return () => window.clearTimeout(timeout);
  }, [notice, noticePaused]);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  const logout = useCallback((clearNotice = true) => {
    void logoutSession().catch(() => undefined);
    setCsrfToken(null);
    setAuthToken(null);
    setAuthInfo(null);
    setState(emptyState);
    setCommandOutputs({});
    if (clearNotice) {
      setNotice(null);
    }
  }, []);

  const recordCommand = (target: CommandOutputKey, result: CommandOutput) => {
    setCommandOutputs((current) => ({ ...current, [target]: result }));
  };

  const clearCommand = (target: CommandOutputKey) => {
    setCommandOutputs((current) => ({ ...current, [target]: null }));
  };

  const updateSessions = useCallback((sessions: SessionRecord[]) => {
    const now = Date.now();
    const previous = sessionSamplesRef.current;
    const nextSamples: Record<string, SessionSample> = {};
    const nextRates: SessionRates = {};
    for (const session of sessions) {
      const key = sessionKey(session);
      const rxBytes = parseTrafficBytes(session.rx);
      const txBytes = parseTrafficBytes(session.tx);
      const before = previous[key];
      if (before) {
        const elapsed = Math.max((now - before.timestamp) / 1000, 1);
        nextRates[key] = {
          download: rateFromDelta(before.txBytes, txBytes, elapsed),
          upload: rateFromDelta(before.rxBytes, rxBytes, elapsed)
        };
      } else {
        nextRates[key] = { download: null, upload: null };
      }
      nextSamples[key] = { rxBytes, txBytes, timestamp: now };
    }
    sessionSamplesRef.current = nextSamples;
    setSessionRates(nextRates);
    setState((current) => ({ ...current, sessions }));
  }, []);

  const syntheticCommand = (argv: string[], stdout = ""): CommandResult => ({
    argv,
    returncode: 0,
    stdout,
    stderr: "",
    dry_run: false
  });

  const loadAll = useCallback(
    async (token: string, options: { includeExtras?: boolean } = {}) => {
      const includeExtras = options.includeExtras ?? false;
      setLoading(true);
      try {
        // Diagnostics and software-version checks each shell out to ~10
        // system commands; only run them on initial load / explicit
        // refresh, not after every unrelated action.
        const [results, extraResults] = await Promise.all([
          Promise.allSettled([
            fetchHealth(),
            fetchServerStatus(token),
            fetchServerProcesses(token),
            fetchUsers(token),
            fetchGroups(token),
            fetchOtpRecords(token),
            fetchSessions(token),
            fetchRoutes(token),
            fetchDomains(token),
            fetchIdentity(token),
            fetchInternalDnsStatus(token),
            fetchUpstreamStatus(token),
            fetchUpstreamProfiles(token),
            fetchConfig(token),
            fetchConfigSource(token),
            fetchRenderedConfig(token),
            fetchLogFiles(token),
            fetchCertificateStatus(token),
            fetchLogRotationSettings(token)
          ]),
          includeExtras
            ? Promise.allSettled([fetchDiagnostics(token), fetchSoftwareVersions(token)])
            : Promise.resolve(null)
        ]);
        const authFailure = [...results, ...(extraResults ?? [])].find(
          (result) => result.status === "rejected" && isAuthError(errorMessage(result.reason))
        );
        if (authFailure?.status === "rejected") {
          throw authFailure.reason;
        }
        const [
          health,
          serverStatus,
          serverProcesses,
          users,
          groups,
          otpRecords,
          sessions,
          routes,
          domains,
          identity,
          internalDns,
          upstream,
          upstreamProfiles,
          config,
          configSource,
          renderedConfig,
          logFiles,
          certificateStatus,
          logRotation
        ] = results;
        setState((current) => ({
          health: settledValue(health, current.health),
          serverStatus: settledValue(serverStatus, current.serverStatus),
          serverProcesses: settledValue(serverProcesses, current.serverProcesses),
          users: settledValue(users, current.users),
          groups: settledValue(groups, current.groups),
          otpRecords: settledValue(otpRecords, current.otpRecords),
          sessions: current.sessions,
          routes: settledValue(routes, current.routes),
          domains: settledValue(domains, current.domains),
          identity: settledValue(identity, current.identity),
          internalDns: settledValue(internalDns, current.internalDns),
          upstream: settledValue(upstream, current.upstream),
          upstreamProfiles: settledValue(upstreamProfiles, current.upstreamProfiles),
          config: settledValue(config, current.config),
          configSource: settledValue(configSource, current.configSource),
          renderedConfig: settledValue(renderedConfig, current.renderedConfig),
          logFiles: settledValue(logFiles, current.logFiles),
          certificateStatus: settledValue(certificateStatus, current.certificateStatus),
          diagnostics: extraResults
            ? settledValue(extraResults[0], current.diagnostics)
            : current.diagnostics,
          softwareVersions: extraResults
            ? settledValue(extraResults[1], current.softwareVersions)
            : current.softwareVersions
        }));
        if (sessions.status === "fulfilled") {
          updateSessions(sessions.value);
        }
        if (!configDirty && configSource.status === "fulfilled") {
          setConfigDraft(configSource.value.content);
        }
        if (certificateStatus.status === "fulfilled") {
          const status = certificateStatus.value;
          setCertificateSettingsDraft({
            mode: status.mode === "external" ? "external" : "auto",
            caName: status.ca_name
          });
          setLetsEncryptDraft((current) => ({
            ...current,
            enabled: status.letsencrypt.enabled,
            email: status.letsencrypt.email ?? "",
            domains: status.letsencrypt.domains.join("\n"),
            reload: status.letsencrypt.renew_reload,
            autoRenew: status.letsencrypt.auto_renew_enabled,
            interval: status.letsencrypt.auto_renew_interval,
            intervalUnit: status.letsencrypt.auto_renew_interval_unit,
            http01Address: status.letsencrypt.http01_address ?? "",
            http01Port: status.letsencrypt.http01_port
          }));
        }
        if (logRotation.status === "fulfilled") {
          setLogRotationDraft(logRotation.value);
        }
        if (config.status === "fulfilled") {
          setRoutingDraft(readRoutingDraft(config.value));
          const upstreamConfig = readRecord(config.value.upstream);
          setUpstreamCheckInterval(readNumber(upstreamConfig.check_interval, 5));
          setUpstreamCheckThreshold(readNumber(upstreamConfig.check_threshold, 3));
          setUpstreamFailover(readBoolean(upstreamConfig.failover, false));
          setServerSettingsDraft(readServerSettingsDraft(config.value));
          setAuthMethodsDraft(readAuthMethodsDraft(config.value));
          setWebSettingsDraft(readWebSettingsDraft(config.value));
          setGeneralSettingsDraft(readGeneralSettingsDraft(config.value));
        }
        if (internalDns.status === "fulfilled") {
          setInternalDnsDraft({
            enabled: internalDns.value.enabled,
            domainsText: internalDns.value.blocklist_domains.join("\n"),
            filesText: internalDns.value.blocklist_files.map((item) => item.path).join("\n"),
            urlsText: internalDns.value.blocklist_urls.map((item) => item.url).join("\n"),
            cacheSize: internalDns.value.cache_size,
            logQueries: internalDns.value.log_queries,
            localRecordsText: internalDns.value.local_records.join("\n")
          });
        }
        if (identity.status === "fulfilled") {
          setOidcDraft(readOidcDraft(identity.value));
          setIdentitySettingsDraft({
            selectGroupByUrl: identity.value.select_group_by_url,
            defaultSelectGroup: identity.value.default_select_group ?? "",
            defaultGroupConfig: identity.value.default_group_config ?? ""
          });
        }
        if (upstream.status === "fulfilled") {
          setUpstreamInterface(upstream.value.interface || "oc-middle0");
        }
        const failureCount = results.filter((result) => result.status === "rejected").length;
        if (failureCount > 0) {
          setNotice({
            kind: "warning",
            text: `${failureCount} dashboard request${failureCount === 1 ? "" : "s"} failed`
          });
        }
      } catch (error) {
        const text = errorMessage(error);
        setNotice({ kind: "error", text });
        if (isAuthError(text)) {
          logout(false);
        }
      } finally {
        setLoading(false);
      }
    },
    [configDirty, logout, updateSessions]
  );

  useEffect(() => {
    if (!authToken || authInfo) {
      return;
    }
    fetchAuthInfo()
      .then((info) => {
        setCsrfToken(info.csrf_token);
        setAuthInfo(info);
        void loadAll(authToken, { includeExtras: true });
      })
      .catch((error: unknown) => {
        const text = errorMessage(error);
        if (!isAuthError(text)) {
          setNotice({ kind: "error", text });
        }
        logout(false);
      });
  }, [authInfo, authToken, loadAll, logout]);

  useEffect(() => {
    if (tab !== "diagnostics" || !authToken || !authInfo) {
      return;
    }
    void loadAll(authToken, { includeExtras: true });
  }, [tab]);

  useEffect(() => {
    if (tab !== "sessions" || !authToken || !authInfo) {
      return;
    }
    const refreshSessions = () => {
      fetchSessions(authToken)
        .then(updateSessions)
        .catch((error: unknown) => {
          const text = errorMessage(error);
          if (!isAuthError(text)) {
            setNotice({ kind: "warning", text });
          }
        });
    };
    refreshSessions();
    const interval = window.setInterval(refreshSessions, 5000);
    return () => window.clearInterval(interval);
  }, [authInfo, authToken, tab, updateSessions]);

  useEffect(() => {
    if (tab !== "config" || configSection !== "upstream" || !authToken || !authInfo) {
      return;
    }
    // The watchdog connects/reconnects in the background, so the
    // Connected/Connection state changes without any panel action --
    // keep it live while the section is open instead of showing whatever
    // was true at login.
    const refreshUpstream = () => {
      Promise.all([fetchUpstreamStatus(authToken), fetchUpstreamProfiles(authToken)])
        .then(([upstream, upstreamProfiles]) => {
          setState((current) => ({ ...current, upstream, upstreamProfiles }));
        })
        .catch(() => {
          // Transient polling failure: keep the last known state.
        });
    };
    const interval = window.setInterval(refreshUpstream, 5000);
    return () => window.clearInterval(interval);
  }, [authInfo, authToken, configSection, tab]);

  useEffect(() => {
    if (tab !== "dashboard" || !authToken || !authInfo) {
      return;
    }
    const refreshInterfaceStats = () => {
      fetchInterfaceStats(authToken)
        .then((stats: InterfaceStats) => {
          setInterfaceName(stats.interface);
          const now = Date.now();
          const previous = interfaceSampleRef.current;
          if (
            stats.rx_bytes !== null &&
            stats.tx_bytes !== null &&
            previous &&
            now > previous.timestamp
          ) {
            const elapsed = (now - previous.timestamp) / 1000;
            const rx = Math.max(stats.rx_bytes - previous.rxBytes, 0) / elapsed;
            const tx = Math.max(stats.tx_bytes - previous.txBytes, 0) / elapsed;
            setInterfaceHistory((current) => [
              ...current.slice(-(INTERFACE_HISTORY_CAP - 1)),
              { rx, tx }
            ]);
          }
          interfaceSampleRef.current =
            stats.rx_bytes !== null && stats.tx_bytes !== null
              ? { rxBytes: stats.rx_bytes, txBytes: stats.tx_bytes, timestamp: now }
              : null;
        })
        .catch(() => {
          // interface load is a best-effort widget; stay silent on transient errors
        });
    };
    refreshInterfaceStats();
    const interval = window.setInterval(refreshInterfaceStats, 3000);
    return () => window.clearInterval(interval);
  }, [authInfo, authToken, tab]);

  const diagnosticScore = useMemo(() => {
    const values = Object.values(state.diagnostics ?? {});
    return {
      ok: values.filter((item) => diagnosticKind(item) !== "error").length,
      total: values.length
    };
  }, [state.diagnostics]);

  const terminalEnabled = readBoolean(readRecord(state.config?.web).terminal_enabled, false);
  const availableTabs = useMemo(
    () => tabs.filter((item) => item.id !== "terminal" || terminalEnabled),
    [terminalEnabled]
  );

  useEffect(() => {
    if (tab === "terminal" && !terminalEnabled) {
      setTab("dashboard");
    }
  }, [tab, terminalEnabled]);

  useEffect(() => {
    if (state.logFiles.length === 0) {
      return;
    }
    if (state.logFiles.some((file) => file.name === logRequest.name)) {
      return;
    }
    const preferred =
      state.logFiles.find((file) => file.name === "api.log") ??
      state.logFiles.find((file) => file.name === "ocserv.log") ??
      state.logFiles.find((file) => file.name === "supervisord.log") ??
      state.logFiles[0];
    setLogRequest((current) => ({ ...current, name: preferred.name }));
  }, [logRequest.name, state.logFiles]);

  const runAction = async <T,>(
    key: string,
    success: string,
    action: (token: string) => Promise<T>,
    options: { reload?: boolean; dryRunAware?: boolean } = {}
  ): Promise<T | null> => {
    if (!authToken) {
      setNotice({ kind: "error", text: "authentication required" });
      return null;
    }
    if (busy) {
      setNotice({ kind: "warning", text: "wait for the current operation to finish" });
      return null;
    }
    setBusy(key);
    setNotice(null);
    try {
      const result = await action(authToken);
      if (options.reload !== false) {
        await loadAll(authToken);
      }
      const showDryRun = Boolean(options.dryRunAware && dryRun);
      setNotice({
        kind: showDryRun ? "warning" : "ok",
        text: showDryRun ? `${success} (dry-run)` : success
      });
      return result;
    } catch (error) {
      setBusy(null);
      const text = errorMessage(error);
      setNotice({ kind: "error", text });
      if (isAuthError(text)) {
        logout(false);
      }
      return null;
    } finally {
      setBusy(null);
    }
  };

  const refreshServerStatus = async (
    token: string,
    expectedState?: "running" | "stopped"
  ): Promise<void> => {
    const attempts = expectedState ? 8 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const [serverStatus, serverProcesses] = await Promise.all([
        fetchServerStatus(token),
        fetchServerProcesses(token)
      ]);
      setState((current) => ({ ...current, serverStatus, serverProcesses }));
      if (!expectedState || serverRuntimeState(serverStatus) === expectedState) {
        return;
      }
      await delay(350);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("login");
    setNotice(null);
    try {
      const info = await login(
        loginForm.username.trim(),
        loginForm.password,
        loginTotpRequired ? loginForm.totpCode.trim() : undefined
      );
      setCsrfToken(info.csrf_token);
      setAuthInfo(info);
      setAuthToken("session");
      setLoginForm({ username: "", password: "", totpCode: "" });
      setLoginTotpRequired(false);
      await loadAll("session", { includeExtras: true });
    } catch (error) {
      const text = errorMessage(error);
      if (text === "totp_code_required") {
        setLoginTotpRequired(true);
        setNotice({ kind: "warning", text: "Enter your authenticator code to continue" });
      } else if (text === "invalid_totp_code") {
        setLoginTotpRequired(true);
        setNotice({ kind: "error", text: "Invalid authenticator code" });
      } else {
        setLoginTotpRequired(false);
        setNotice({ kind: "error", text });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = newUser.username.trim();
    const result = await runAction(
      "create-user",
      `User ${username} created`,
      (token) => createUser(token, username, newUser.password, dryRun),
      { dryRunAware: true }
    );
    recordCommand("users", result);
    if (result !== null && !dryRun) {
      setNewUser({ username: "", password: "" });
    }
  };

  const handleUploadExternalCertificates = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!externalCertFiles.serverCert || !externalCertFiles.serverKey || !externalCertFiles.caCert) {
      setNotice({ kind: "error", text: "select server certificate, server key and CA certificate" });
      return;
    }
    const result = await runAction(
      "cert-upload",
      "External certificates installed",
      (token) =>
        uploadExternalCertificates(
          token,
          {
            serverCert: externalCertFiles.serverCert as File,
            serverKey: externalCertFiles.serverKey as File,
            caCert: externalCertFiles.caCert as File
          },
          letsEncryptDraft.reload
        ),
      { reload: false }
    );
    recordCommand("certificates", result?.reload ?? null);
    if (result !== null && authToken) {
      setExternalCertFiles({ serverCert: null, serverKey: null, caCert: null });
      await loadAll(authToken);
    }
  };

  const handleIssueLetsEncrypt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const domains = splitLines(letsEncryptDraft.domains);
    const result = await runAction(
      "le-issue",
      "Let's Encrypt certificate issued",
      (token) =>
        issueLetsEncryptCertificate(token, {
          email: letsEncryptDraft.email,
          domains,
          staging: letsEncryptDraft.staging,
          reload: letsEncryptDraft.reload,
          auto_renew_enabled: letsEncryptDraft.autoRenew,
          auto_renew_interval: letsEncryptDraft.interval,
          auto_renew_interval_unit: letsEncryptDraft.intervalUnit,
          dry_run: dryRun
        }),
      { reload: false, dryRunAware: true }
    );
    recordCommand(
      "certificates",
      result ? [result.result, ...(result.reload ? [result.reload] : [])] : null
    );
    if (result !== null && authToken && !dryRun) {
      await loadAll(authToken);
    }
  };

  const handleRenewLetsEncrypt = async () => {
    const result = await runAction(
      "le-renew",
      "Let's Encrypt renewal completed",
      (token) => renewLetsEncryptCertificate(token, letsEncryptDraft.reload, dryRun),
      { reload: false, dryRunAware: true }
    );
    recordCommand(
      "certificates",
      result ? [result.result, ...(result.reload ? [result.reload] : [])] : null
    );
    if (result !== null && authToken && !dryRun) {
      await loadAll(authToken);
    }
  };

  const handleSaveLetsEncryptSettings = async (enabled = letsEncryptDraft.enabled) => {
    const domains = splitLines(letsEncryptDraft.domains);
    const result = await runAction(
      "le-settings",
      "Let's Encrypt settings saved",
      (token) =>
        saveLetsEncryptSettings(token, {
          enabled,
          email: letsEncryptDraft.email.trim() || null,
          domains,
          renew_reload: letsEncryptDraft.reload,
          auto_renew_enabled: letsEncryptDraft.autoRenew,
          auto_renew_interval: letsEncryptDraft.interval,
          auto_renew_interval_unit: letsEncryptDraft.intervalUnit,
          http01_address: letsEncryptDraft.http01Address.trim() || null,
          http01_port: letsEncryptDraft.http01Port
        }),
      { reload: false }
    );
    if (result !== null && authToken) {
      await loadAll(authToken);
    }
  };

  const handleSetLetsEncryptEnabled = async (enabled: boolean) => {
    setLetsEncryptDraft((current) => ({ ...current, enabled }));
    await handleSaveLetsEncryptSettings(enabled);
  };

  const handleSaveCertificateSettings = async () => {
    const result = await runAction(
      "certificate-settings",
      "Certificate settings saved",
      (token) =>
        saveCertificateSettings(token, {
          mode: certificateSettingsDraft.mode,
          ca_name: certificateSettingsDraft.caName
        }),
      { reload: false }
    );
    if (result !== null && authToken) {
      await loadAll(authToken);
    }
  };

  const handleSaveRoutes = async (items: string[]) => {
    const result = await runAction("save-routes", "Routes saved", (token) =>
      setRoutes(token, items)
    );
    if (result !== null) {
      recordCommand("routing", syntheticCommand(["korctl", "routes", "set", ...items], "saved"));
    }
  };

  const handleSaveDomains = async (items: string[]) => {
    const result = await runAction("save-domains", "Domains saved", (token) =>
      setDomains(token, items)
    );
    if (result !== null) {
      recordCommand("routing", syntheticCommand(["korctl", "domains", "set", ...items], "saved"));
    }
  };

  const handleSaveRoutingSettings = async () => {
    const result = await runAction("routing-settings", "Routing settings saved", (token) =>
      saveRoutingSettings(token, {
        mode: routingDraft.mode,
        tunnel_dns: routingDraft.tunnelDns,
        host_traffic: routingDraft.hostTraffic,
        dnsmasq_listen: routingDraft.dnsmasqListen,
        dnsmasq_port: routingDraft.dnsmasqPort,
        main_interface: routingDraft.mainInterface,
        fwmark: routingDraft.fwmark,
        table_id: routingDraft.tableId,
        nft_prefix: routingDraft.nftPrefix
      })
    );
    if (result !== null) {
      recordCommand("routing", syntheticCommand(["korctl", "routing", "settings"], "saved"));
    }
  };

  const handleSaveInternalDnsSettings = async () => {
    const result = await runAction(
      "internal-dns-settings",
      "Internal DNS settings saved",
      (token) =>
        saveInternalDnsSettings(token, {
          enabled: internalDnsDraft.enabled,
          blocklist_domains: splitLines(internalDnsDraft.domainsText),
          blocklist_files: splitLines(internalDnsDraft.filesText),
          blocklist_urls: splitLines(internalDnsDraft.urlsText),
          cache_size: internalDnsDraft.cacheSize,
          log_queries: internalDnsDraft.logQueries,
          local_records: splitLines(internalDnsDraft.localRecordsText)
        })
    );
    if (result !== null) {
      recordCommand(
        "internal_dns",
        syntheticCommand(["korctl", "internal-dns", "settings"], "saved")
      );
    }
  };

  const handleRefreshInternalDnsBlocklist = async (url: string, preview: boolean) => {
    const result = await runAction(
      preview ? `internal-dns-preview-${url}` : `internal-dns-refresh-${url}`,
      preview ? "Blocklist URL validated" : "Blocklist downloaded and applied",
      (token) => refreshInternalDnsBlocklist(token, url, preview)
    );
    if (result !== null) {
      const argv = ["korctl", "internal-dns", "refresh", "--url", url];
      if (preview) {
        argv.push("--preview");
      }
      const sample = result.sample.length
        ? `sample:\n  ${result.sample.join("\n  ")}`
        : "sample: (empty)";
      recordCommand(
        "internal_dns",
        syntheticCommand(
          argv,
          [
            `url: ${result.url}`,
            `valid domains: ${result.valid}`,
            `skipped lines: ${result.skipped}`,
            `applied: ${result.saved ? "yes" : "no (preview)"}`,
            sample
          ].join("\n")
        )
      );
    }
  };

  const handleSaveServerSettings = async () => {
    const result = await runAction("server-config-settings", "Server settings saved", (token) =>
      saveServerSettings(token, {
        enabled: serverSettingsDraft.enabled,
        listen: serverSettingsDraft.listen,
        port: serverSettingsDraft.port,
        udp_enabled: serverSettingsDraft.udpEnabled,
        device: serverSettingsDraft.device,
        cn: serverSettingsDraft.cn,
        realm: serverSettingsDraft.realm,
        ipv4_network: serverSettingsDraft.ipv4Network,
        dns: splitLines(serverSettingsDraft.dns),
        search_domains: splitLines(serverSettingsDraft.searchDomains),
        routes: splitLines(serverSettingsDraft.routes),
        no_routes: splitLines(serverSettingsDraft.noRoutes),
        max_clients: serverSettingsDraft.maxClients,
        max_same_clients: serverSettingsDraft.maxSameClients,
        keepalive: serverSettingsDraft.keepalive,
        compression: serverSettingsDraft.compression,
        cisco_client_compat: serverSettingsDraft.ciscoClientCompat,
        camouflage: {
          enabled: serverSettingsDraft.camouflageEnabled,
          secret: serverSettingsDraft.camouflageSecret || null,
          realm: serverSettingsDraft.camouflageRealm
        },
        connect_script: serverSettingsDraft.connectScript || null,
        disconnect_script: serverSettingsDraft.disconnectScript || null,
        debug_level: serverSettingsDraft.debugLevel
      })
    );
    if (result !== null) {
      recordCommand(
        "config",
        result.reload
          ? [syntheticCommand(["korctl", "server", "settings"], "saved"), result.reload]
          : syntheticCommand(["korctl", "server", "settings"], "saved")
      );
    }
  };

  const handleSaveAuthMethodsSettings = async () => {
    const result = await runAction(
      "auth-methods-settings",
      "Authentication method settings saved",
      (token) =>
        saveAuthMethodsSettings(token, {
          password_enabled: authMethodsDraft.passwordEnabled,
          certificate_enabled: authMethodsDraft.certificateEnabled,
          otp_enabled: authMethodsDraft.otpEnabled,
          otp_ocserv_oath_auth: authMethodsDraft.otpOcservOathAuth,
          otp_issuer: authMethodsDraft.otpIssuer,
          otp_send_by_email: authMethodsDraft.otpSendByEmail,
          otp_send_by_telegram: authMethodsDraft.otpSendByTelegram
        })
    );
    if (result !== null) {
      recordCommand("config", syntheticCommand(["korctl", "server", "auth-settings"], "saved"));
    }
  };

  const handleSaveWebSettings = async () => {
    const result = await runAction("web-config-settings", "Web panel settings saved", (token) =>
      saveWebSettings(token, {
        enabled: webSettingsDraft.enabled,
        listen: webSettingsDraft.listen,
        port: webSettingsDraft.port,
        tls: webSettingsDraft.tls,
        allow_insecure_http: webSettingsDraft.allowInsecureHttp,
        trusted_proxies: splitLines(webSettingsDraft.trustedProxies),
        admin_user: webSettingsDraft.adminUser,
        terminal_enabled: webSettingsDraft.terminalEnabled,
        terminal_idle_timeout: webSettingsDraft.terminalIdleTimeout,
        terminal_max_sessions: webSettingsDraft.terminalMaxSessions,
        session_lifetime: webSettingsDraft.sessionLifetime,
        session_cookie_secure: webSettingsDraft.sessionCookieSecure
      })
    );
    if (result !== null) {
      recordCommand("config", syntheticCommand(["korctl", "web-config", "settings"], "saved"));
    }
  };

  const handleSaveGeneralSettings = async () => {
    const result = await runAction("general-settings", "General settings saved", (token) =>
      saveGeneralSettings(token, {
        timezone: generalSettingsDraft.timezone,
        log_level: generalSettingsDraft.logLevel,
        project_name: generalSettingsDraft.projectName,
        cli_enabled: generalSettingsDraft.cliEnabled
      })
    );
    if (result !== null) {
      recordCommand("config", syntheticCommand(["korctl", "config", "general-settings"], "saved"));
    }
  };

  const handleSaveOidcSettings = async () => {
    const result = await runAction("oidc-settings", "OIDC connector settings saved", (token) =>
      saveOidcSettings(token, {
        enabled: oidcDraft.enabled,
        connector: oidcDraft.connector,
        pam_service: oidcDraft.pamService,
        pam_gid_min: oidcDraft.pamGidMin ? Number(oidcDraft.pamGidMin) : null,
        radius_config_file: oidcDraft.radiusConfigFile,
        radius_groupconfig: oidcDraft.radiusGroupconfig,
        radius_nas_identifier: oidcDraft.radiusNasIdentifier || null,
        radius_group_separator: oidcDraft.radiusGroupSeparator,
      })
    );
    if (result !== null) {
      recordCommand("identity", syntheticCommand(["korctl", "identity", "oidc", "settings"], "saved"));
    }
  };

  const handleSaveIdentitySettings = async () => {
    const result = await runAction(
      "identity-settings",
      "Group routing settings saved",
      (token) =>
        saveIdentitySettings(token, {
          select_group_by_url: identitySettingsDraft.selectGroupByUrl,
          default_select_group: identitySettingsDraft.defaultSelectGroup.trim() || null,
          default_group_config: identitySettingsDraft.defaultGroupConfig.trim() || null
        }),
      { reload: false }
    );
    if (result !== null) {
      recordCommand(
        "identity",
        syntheticCommand(["korctl", "identity", "settings"], "saved")
      );
    }
  };

  const handleSaveOidcProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await runAction("oidc-provider", "OIDC provider saved", (token) =>
      saveOidcProvider(token, oidcProviderDraft)
    );
    if (result !== null) {
      recordCommand("identity", syntheticCommand(["korctl", "identity", "oidc", "provider-set"], "saved"));
      setOidcProviderDraft((current) => ({ ...current, client_secret: "" }));
    }
  };

  const handleSaveGroupPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await runAction("group-policy", "Group policy saved", (token) =>
      saveGroupPolicy(token, groupPolicyDraft)
    );
    if (result !== null) {
      recordCommand("identity", syntheticCommand(["korctl", "identity", "group", "set"], "saved"));
    }
  };

  const handleSaveUpstreamSettings = async (enabled: boolean) => {
    const result = await runAction(
      "upstream-settings",
      `Upstream ${enabled ? "enabled" : "disabled"}`,
      (token) =>
        saveUpstreamSettings(token, {
          enabled,
          interface: upstreamInterface,
          active_profile: state.upstream?.active_profile ?? state.upstreamProfiles[0]?.name ?? null,
          check_interval: upstreamCheckInterval,
          check_threshold: upstreamCheckThreshold,
          failover: upstreamFailover
        })
    );
    if (result !== null) {
      recordCommand("upstream", syntheticCommand(["korctl", "upstream", "settings"], "saved"));
    }
  };

  const handleSaveUpstreamCheckHost = async () => {
    const active = state.upstreamProfiles.find(
      (profile) => profile.name === state.upstream?.active_profile
    );
    if (!active) {
      return;
    }
    const draft: UpstreamProfileDraft = {
      ...upstreamProfileToDraft(active),
      check_host: upstreamCheckHost,
      enable: Boolean(state.upstream?.enabled)
    };
    const result = await runAction("upstream-settings", "Check host saved", (token) =>
      saveUpstreamProfile(token, draft)
    );
    if (result !== null) {
      recordCommand("upstream", syntheticCommand(["korctl", "upstream", "profile"], "saved"));
    }
  };

  const handleSaveUpstreamProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await runAction("upstream-profile", "Upstream profile saved", (token) =>
      saveUpstreamProfile(token, upstreamDraft)
    );
    if (result !== null) {
      recordCommand("upstream", syntheticCommand(["korctl", "upstream", "profile"], "saved"));
      setUpstreamModalOpen(false);
    }
  };

  const handleDeleteUpstreamProfile = async (name: string) => {
    if (!confirmAction(`Delete upstream profile ${name}?`)) {
      return;
    }
    const result = await runAction(`upstream-profile-delete-${name}`, `Upstream profile ${name} deleted`, (token) =>
      deleteUpstreamProfile(token, name)
    );
    if (result !== null) {
      recordCommand("upstream", syntheticCommand(["korctl", "upstream", "profile", "delete", name], "deleted"));
    }
  };

  const handleSetUpstreamProfileEnabled = async (name: string, enabled: boolean) => {
    const result = await runAction(
      `upstream-profile-enabled-${name}`,
      `Upstream profile ${name} ${enabled ? "enabled" : "disabled"}`,
      (token) => setUpstreamProfileEnabled(token, name, enabled)
    );
    if (result !== null) {
      recordCommand(
        "upstream",
        syntheticCommand(
          ["korctl", "upstream", enabled ? "enable" : "disable", name],
          enabled ? "enabled" : "disabled"
        )
      );
    }
  };

  const loadLogTail = useCallback(async (showNotice = true) => {
    if (!authToken) {
      return;
    }
    if (showNotice && busy) {
      setNotice({ kind: "warning", text: "wait for the current operation to finish" });
      return;
    }
    if (showNotice) {
      setBusy("fetch-log");
      setNotice(null);
    }
    try {
      const result = await fetchLog(authToken, logRequest.name, logRequest.lines);
      setLogTail(result);
      if (showNotice) {
        setNotice({ kind: "ok", text: `Loaded ${logRequest.name}` });
      }
    } catch (error) {
      const text = errorMessage(error);
      if (showNotice || !isAuthError(text)) {
        setNotice({ kind: "error", text });
      }
      if (isAuthError(text)) {
        logout(false);
      }
    } finally {
      if (showNotice) {
        setBusy(null);
      }
    }
  }, [authToken, busy, logRequest.lines, logRequest.name, logout]);

  useEffect(() => {
    if (!liveLog || tab !== "logs" || !authToken || !authInfo || !logRequest.name) {
      return;
    }
    void loadLogTail(false);
    const interval = window.setInterval(() => void loadLogTail(false), 2500);
    return () => window.clearInterval(interval);
  }, [authInfo, authToken, liveLog, loadLogTail, logRequest.name, tab]);

  const handleFetchLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadLogTail(true);
  };

  const handleSaveLogRotation = async () => {
    await runAction("log-rotation-save", "Log rotation settings saved", (token) =>
      saveLogRotationSettings(token, logRotationDraft)
    );
  };

  const handleRunLogRotation = async () => {
    const result = await runAction("log-rotation-run", "Logs rotated", (token) =>
      runLogRotation(token)
    );
    if (result) {
      setNotice({
        kind: "ok",
        text: result.rotated.length
          ? `Rotated: ${result.rotated.join(", ")}`
          : "No logs needed rotation"
      });
    }
  };

  const downloadP12 = async (token: string, username: string) => {
    setBusy(`download-p12-${username}`);
    setNotice(null);
    try {
      const blob = await fetchP12(token, username);
      saveBlob(blob, `${username}.p12`);
      setNotice({ kind: "ok", text: `Downloaded ${username}.p12` });
    } catch (error) {
      const text = errorMessage(error);
      setNotice({ kind: "error", text });
      if (isAuthError(text)) {
        logout(false);
      }
    } finally {
      setBusy(null);
    }
  };

  const downloadCert = async (token: string, username: string) => {
    setBusy(`download-cert-${username}`);
    setNotice(null);
    try {
      const blob = await fetchUserCert(token, username);
      saveBlob(blob, `${username}.crt`);
      setNotice({ kind: "ok", text: `Downloaded ${username}.crt` });
    } catch (error) {
      const text = errorMessage(error);
      setNotice({ kind: "error", text });
      if (isAuthError(text)) {
        logout(false);
      }
    } finally {
      setBusy(null);
    }
  };

  const downloadKey = async (token: string, username: string) => {
    setBusy(`download-key-${username}`);
    setNotice(null);
    try {
      const blob = await fetchUserKey(token, username);
      saveBlob(blob, `${username}.key`);
      setNotice({ kind: "ok", text: `Downloaded ${username}.key` });
    } catch (error) {
      const text = errorMessage(error);
      setNotice({ kind: "error", text });
      if (isAuthError(text)) {
        logout(false);
      }
    } finally {
      setBusy(null);
    }
  };

  const viewP12Base64 = async (token: string, username: string) => {
    setBusy(`view-p12-base64-${username}`);
    setNotice(null);
    try {
      const blob = await fetchP12(token, username);
      const base64 = await blobToBase64(blob);
      setP12Base64Modal({ username, base64 });
    } catch (error) {
      const text = errorMessage(error);
      setNotice({ kind: "error", text });
      if (isAuthError(text)) {
        logout(false);
      }
    } finally {
      setBusy(null);
    }
  };

  if (!authToken || !authInfo) {
    return (
      <LoginScreen
        form={loginForm}
        busy={busy === "login"}
        notice={notice}
        theme={theme}
        totpRequired={loginTotpRequired}
        onChange={setLoginForm}
        onSubmit={handleLogin}
        onToggleTheme={toggleTheme}
      />
    );
  }

  const activeTab = availableTabs.find((item) => item.id === tab) ?? availableTabs[0];
  const selectTab = (target: Tab) => {
    setTab(target);
    setMobileNavOpen(false);
  };

  return (
    <main className={`app-shell${mobileNavOpen ? " nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <RavenMark />
          <strong>Korvus Server</strong>
        </div>
        <nav aria-label="Primary">
          {availableTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={tab === item.id ? "active" : ""}
                key={item.id}
                onClick={() => selectTab(item.id)}
                title={item.label}
                type="button"
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <RavenMark />
          <div>
            <strong>r4ven.me</strong>
            <a href="https://r4ven.me" rel="noreferrer" target="_blank">
              Website
            </a>
            <a href="https://github.com/r4ven-me" rel="noreferrer" target="_blank">
              GitHub
            </a>
            <a href="https://t.me/r4ven_me" rel="noreferrer" target="_blank">
              Telegram
            </a>
            <small>
              Korvus Server {state.health?.version ?? ""}
              <br />
              Vibecoded by Ivan Cherniy
            </small>
          </div>
        </div>
      </aside>
      <button
        className="nav-backdrop"
        onClick={() => setMobileNavOpen(false)}
        type="button"
        aria-label="Close menu"
      />
      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <IconButton
              label="Menu"
              icon={Menu}
              onClick={() => setMobileNavOpen((current) => !current)}
              extraClassName="mobile-menu-button"
            />
            <div>
            <h1>{activeTab.label}</h1>
            <p>{state.health ? `API ${state.health.version}` : "API"}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <label className="switch" title="Preview commands without applying dangerous runtime changes">
              <input
                checked={dryRun}
                onChange={(event) => setDryRun(event.target.checked)}
                type="checkbox"
              />
              <span>Dry-run</span>
            </label>
            <span className="status ok">Connected as {authInfo.username}</span>
            <IconButton
              label="Refresh"
              icon={RefreshCw}
              busy={loading}
              onClick={() =>
                void loadAll(authToken, { includeExtras: tab === "diagnostics" })
              }
            />
            <IconButton
              label={theme === "dark" ? "Light theme" : "Dark theme"}
              icon={theme === "dark" ? Sun : Moon}
              onClick={toggleTheme}
            />
            <IconButton label="Log out" icon={LogOut} onClick={logout} />
          </div>
        </header>

        {tab === "dashboard" && (
          <DashboardView
            state={state}
            diagnosticScore={diagnosticScore}
            busy={busy}
            interfaceName={interfaceName}
            interfaceHistory={interfaceHistory}
            commandOutput={commandOutputs.dashboard ?? null}
            onClearCommand={() => clearCommand("dashboard")}
            onStartServer={async () => {
              const result = await runAction(
                "start-server",
                "Server start requested",
                (token) => startServer(token, dryRun),
                { reload: dryRun, dryRunAware: true }
              );
              recordCommand("dashboard", result);
              if (result !== null && authToken && !dryRun) {
                await refreshServerStatus(authToken, "running");
              }
            }}
            onStopServer={async () => {
              if (!confirmAction("Stop the VPN server? Active sessions will be disconnected.")) {
                return;
              }
              const result = await runAction(
                "stop-server",
                "Server stop requested",
                (token) => stopServer(token, dryRun),
                { reload: dryRun, dryRunAware: true }
              );
              recordCommand("dashboard", result);
              if (result !== null && authToken && !dryRun) {
                await refreshServerStatus(authToken, "stopped");
              }
            }}
            onReloadServer={async () => {
              const result = await runAction(
                "reload-server",
                "Korvus Server reload requested",
                (token) => reloadServer(token, dryRun),
                { dryRunAware: true }
              );
              recordCommand("dashboard", result);
              if (result !== null && authToken && !dryRun) {
                await refreshServerStatus(authToken);
              }
            }}
            onRestartServer={async () => {
              if (!confirmAction("Restart ocserv? Active sessions will be disconnected.")) {
                return;
              }
              const result = await runAction(
                "restart-server",
                "ocserv restart requested",
                (token) => restartServer(token, dryRun),
                { dryRunAware: true }
              );
              recordCommand("dashboard", result);
              if (result !== null && authToken && !dryRun) {
                await refreshServerStatus(authToken, "running");
                const sessions = await fetchSessions(authToken);
                updateSessions(sessions);
              }
            }}
            onWriteConfig={() =>
              void runAction("write-config", "Generated configs written", writeRenderedConfig)
            }
            onApplyNft={async () => {
              const result = await runAction(
                "apply-nft",
                "nftables rules applied",
                (token) => applyNft(token, dryRun),
                { dryRunAware: true }
              );
              recordCommand("dashboard", result);
            }}
          />
        )}

        {tab === "users" && (
          <UsersView
            users={state.users}
            otpRecords={state.otpRecords}
            busy={busy}
            newUser={newUser}
            passwordDrafts={passwordDrafts}
            p12Drafts={p12Drafts}
            commandOutput={commandOutputs.users ?? null}
            onClearCommand={() => clearCommand("users")}
            onNewUserChange={setNewUser}
            onPasswordDraftChange={(username, value) =>
              setPasswordDrafts((current) => ({ ...current, [username]: value }))
            }
            onP12DraftChange={(username, value) =>
              setP12Drafts((current) => ({
                ...current,
                [username]: { ...p12DraftFor(current, username), ...value }
              }))
            }
            onCreate={handleCreateUser}
            onChangePassword={async (username) => {
              const password = passwordDrafts[username] ?? "";
              const result = await runAction(
                `password-${username}`,
                `Password changed for ${username}`,
                (token) => changePassword(token, username, password, dryRun),
                { dryRunAware: true }
              );
              recordCommand("users", result);
              if (result !== null && !dryRun) {
                setPasswordDrafts((current) => ({ ...current, [username]: "" }));
              }
            }}
            onEnable={async (username, enabled) => {
              const result = await runAction(
                `${enabled ? "enable" : "disable"}-${username}`,
                `${username} ${enabled ? "enabled" : "disabled"}`,
                (token) => setUserEnabled(token, username, enabled, dryRun),
                { dryRunAware: true }
              );
              recordCommand("users", result);
            }}
            onDelete={async (username) => {
              if (!confirmAction(`Delete user ${username}?`)) {
                return;
              }
              const result = await runAction(
                `delete-${username}`,
                `User ${username} deleted`,
                (token) => deleteUser(token, username)
              );
              recordCommand("users", result);
            }}
            onOtp={(username, enabled) =>
              void runAction(
                `${enabled ? "otp-on" : "otp-off"}-${username}`,
                `OTP ${enabled ? "enabled" : "disabled"} for ${username}`,
                (token) => setOtp(token, username, enabled)
              )
            }
            onOtpQr={async (username) => {
              const result = await runAction(
                `otp-qr-${username}`,
                `OTP QR generated for ${username}`,
                (token) => fetchOtpQr(token, username),
                { reload: false }
              );
              recordCommand("users", result);
            }}
            onCert={async (username) => {
              const result = await runAction(
                `cert-${username}`,
                `Certificate issued for ${username}`,
                (token) => createCertificate(token, username, dryRun),
                { dryRunAware: true }
              );
              recordCommand("users", result?.results ?? null);
            }}
            onRevokeCert={async (username) => {
              if (!confirmAction(`Revoke the certificate for ${username}?`)) {
                return;
              }
              const result = await runAction(
                `revoke-cert-${username}`,
                `Certificate revoked for ${username}`,
                (token) => revokeCertificate(token, username, dryRun),
                { dryRunAware: true }
              );
              recordCommand("users", result);
            }}
            onP12={async (username) => {
              const draft = p12DraftFor(p12Drafts, username);
              const result = await runAction(
                `p12-${username}`,
                `PKCS#12 created for ${username}`,
                (token) => createP12(token, username, draft.passphrase, draft.appleCompatible, dryRun),
                { dryRunAware: true }
              );
              recordCommand("users", result);
              if (result !== null && result.returncode === 0 && !dryRun) {
                await downloadP12(authToken, username);
                setP12Drafts((current) => ({
                  ...current,
                  [username]: { ...p12DraftFor(current, username), passphrase: "" }
                }));
              }
            }}
            onDownloadP12={(username) => downloadP12(authToken, username)}
            onDownloadCert={(username) => downloadCert(authToken, username)}
            onDownloadKey={(username) => downloadKey(authToken, username)}
            onViewP12Base64={(username) => viewP12Base64(authToken, username)}
            onOpenConfig={async (username) => {
              await runAction(
                `user-config-load-${username}`,
                `Loaded config for ${username}`,
                async (token) => {
                  const draft = await fetchUserConfig(token, username);
                  setUserConfigModal({ username, draft: { ...emptyUserConfig, ...draft } });
                  return { status: "ok" };
                },
                { reload: false }
              );
            }}
            onOpenGroups={(username) => {
              const user = state.users.find((item) => item.username === username);
              setUserGroupsModal({ username, groups: user?.groups ?? [] });
            }}
          />
        )}

        {tab === "groups" && (
          <GroupsView
            groups={state.groups}
            users={state.users}
            name={newGroupName}
            busy={busy}
            commandOutput={commandOutputs.groups ?? null}
            onClearCommand={() => clearCommand("groups")}
            onNameChange={setNewGroupName}
            onCreate={() => {
              const name = newGroupName.trim();
              if (!name) {
                setNotice({ kind: "error", text: "group name is required" });
                return;
              }
              setGroupConfigModal({ name, draft: { ...emptyUserConfig } });
            }}
            onOpenConfig={async (name) => {
              await runAction(
                `group-config-load-${name}`,
                `Loaded config for ${name}`,
                async (token) => {
                  const draft = await fetchGroupConfig(token, name);
                  setGroupConfigModal({ name, draft: { ...emptyUserConfig, ...draft } });
                  return { status: "ok" };
                },
                { reload: false }
              );
            }}
            onDeleteConfig={async (name) => {
              if (!confirmAction(`Clear config for group ${name}?`)) {
                return;
              }
              const result = await runAction(
                `group-config-delete-${name}`,
                `Config cleared for ${name}`,
                (token) => deleteGroupConfig(token, name),
                { reload: false }
              );
              recordCommand("groups", result);
              if (result !== null && authToken) {
                const groups = await fetchGroups(authToken);
                setState((current) => ({ ...current, groups }));
              }
            }}
            onDeleteGroup={async (name) => {
              if (
                !confirmAction(
                  `Delete group ${name}? This removes its config file, its group policy ` +
                    "and clears it from every member's group list."
                )
              ) {
                return;
              }
              const result = await runAction(
                `group-delete-${name}`,
                `Group ${name} deleted`,
                (token) => deleteGroup(token, name),
                { reload: false }
              );
              recordCommand("groups", result);
              if (result !== null && authToken) {
                const [groups, users] = await Promise.all([
                  fetchGroups(authToken),
                  fetchUsers(authToken)
                ]);
                setState((current) => ({ ...current, groups, users }));
              }
            }}
            onOpenMembers={(name) => {
              setGroupMembersModal({
                name,
                users: state.users
                  .filter((user) => (user.groups ?? []).includes(name))
                  .map((user) => user.username)
              });
            }}
          />
        )}

        {tab === "sessions" && (
          <SessionsView
            sessions={state.sessions}
            sessionRates={sessionRates}
            busy={busy}
            commandOutput={commandOutputs.sessions ?? null}
            onClearCommand={() => clearCommand("sessions")}
            onKick={async (username) => {
              if (!confirmAction(`Disconnect all active sessions for ${username}?`)) {
                return;
              }
              const result = await runAction(
                `kick-${username}`,
                `Kick requested for ${username}`,
                (token) => kickSession(token, username, dryRun),
                { dryRunAware: true }
              );
              recordCommand("sessions", result);
            }}
          />
        )}

        {tab === "config" && (
          <ConfigSubnav active={configSection} onSelect={setConfigSection} />
        )}

        {tab === "config" && configSection === "internal_dns" && (
          <InternalDnsView
            status={state.internalDns}
            draft={internalDnsDraft}
            dnsServerDraft={routingDraft}
            busy={busy}
            commandOutput={commandOutputs.internal_dns ?? null}
            onClearCommand={() => clearCommand("internal_dns")}
            onDraftChange={setInternalDnsDraft}
            onDnsServerDraftChange={setRoutingDraft}
            onSave={() => void handleSaveInternalDnsSettings()}
            onSaveDnsServer={() => void handleSaveRoutingSettings()}
            onPreviewUrl={(url) => void handleRefreshInternalDnsBlocklist(url, true)}
            onRefreshUrl={(url) => void handleRefreshInternalDnsBlocklist(url, false)}
          />
        )}

        {tab === "config" && configSection === "identity" && (
          <IdentityView
            identity={state.identity}
            oidcDraft={oidcDraft}
            providerDraft={oidcProviderDraft}
            groupDraft={groupPolicyDraft}
            identitySettingsDraft={identitySettingsDraft}
            busy={busy}
            commandOutput={commandOutputs.identity ?? null}
            onClearCommand={() => clearCommand("identity")}
            onOidcDraftChange={setOidcDraft}
            onProviderDraftChange={setOidcProviderDraft}
            onGroupDraftChange={setGroupPolicyDraft}
            onIdentitySettingsDraftChange={setIdentitySettingsDraft}
            onSaveIdentitySettings={() => void handleSaveIdentitySettings()}
            onSaveOidcSettings={() => void handleSaveOidcSettings()}
            onSaveProvider={handleSaveOidcProvider}
            onSaveGroup={handleSaveGroupPolicy}
            onDeleteProvider={(name) =>
              void runAction(`oidc-provider-delete-${name}`, `OIDC provider ${name} deleted`, (token) =>
                deleteOidcProvider(token, name)
              )
            }
            onDeleteGroup={(name) =>
              void runAction(`group-policy-delete-${name}`, `Group policy ${name} deleted`, (token) =>
                deleteGroupPolicy(token, name)
              )
            }
          />
        )}

        {tab === "config" && configSection === "upstream" && (
          <div className="view-stack">
            <UpstreamView
              status={state.upstream}
              profiles={state.upstreamProfiles}
              busy={busy}
              commandOutput={commandOutputs.upstream ?? null}
              onClearCommand={() => clearCommand("upstream")}
              onSetEnabled={(enabled) => void handleSaveUpstreamSettings(enabled)}
              onSetProfileEnabled={(profile, enabled) =>
                void handleSetUpstreamProfileEnabled(profile, enabled)
              }
              onSwitch={(profile) =>
                void runAction(`switch-${profile}`, `Upstream profile ${profile} selected`, (token) =>
                  switchUpstream(token, profile)
                )
              }
              onDeleteProfile={(profile) => void handleDeleteUpstreamProfile(profile)}
              onCreateProfile={() => {
                setUpstreamDraft(emptyUpstreamProfileDraft);
                setEditingUpstreamProfile(false);
                setUpstreamDialogKey((key) => key + 1);
                setUpstreamModalOpen(true);
              }}
              onEditProfile={(profile) => {
                setUpstreamDraft(upstreamProfileToDraft(profile));
                setEditingUpstreamProfile(true);
                setUpstreamDialogKey((key) => key + 1);
                setUpstreamModalOpen(true);
              }}
              onConnect={async () => {
                const result = await runAction(
                  "connect-upstream",
                  "Upstream connected",
                  (token) => connectUpstream(token, dryRun),
                  { dryRunAware: true }
                );
                recordCommand("upstream", result);
              }}
              onDisconnect={async () => {
                const result = await runAction(
                  "disconnect-upstream",
                  "Upstream disconnected",
                  (token) => disconnectUpstream(token, dryRun),
                  { dryRunAware: true }
                );
                recordCommand("upstream", result);
              }}
              onConnectProfile={async (name) => {
                const result = await runAction(
                  `upstream-profile-connect-${name}`,
                  `Profile ${name} connected`,
                  (token) => connectUpstreamProfile(token, name, dryRun),
                  { dryRunAware: true }
                );
                recordCommand("upstream", result);
              }}
              onDisconnectProfile={async (name) => {
                const result = await runAction(
                  `upstream-profile-disconnect-${name}`,
                  `Profile ${name} disconnected`,
                  (token) => disconnectUpstreamProfile(token, name, dryRun),
                  { dryRunAware: true }
                );
                recordCommand("upstream", result);
              }}
              onOpenSettings={() => {
                const active = state.upstreamProfiles.find(
                  (profile) => profile.name === state.upstream?.active_profile
                );
                setUpstreamCheckHost(active?.check_host ?? "");
                setUpstreamSettingsModalOpen(true);
              }}
            />
            <RoutingView
              routes={state.routes}
              domains={state.domains}
              routingDraft={routingDraft}
              busy={busy}
              commandOutput={commandOutputs.routing ?? null}
              onClearCommand={() => clearCommand("routing")}
              onRoutingDraftChange={setRoutingDraft}
              onSaveRoutingSettings={() => void handleSaveRoutingSettings()}
              onSaveRoutes={(items) => void handleSaveRoutes(items)}
              onSaveDomains={(items) => void handleSaveDomains(items)}
              onReloadRouting={async () => {
                const result = await runAction(
                  "reload-routing",
                  "Routing reload requested",
                  (token) => reloadRouting(token, dryRun),
                  { dryRunAware: true }
                );
                recordCommand("routing", result);
              }}
              onApplyNft={async () => {
                const result = await runAction(
                  "apply-nft",
                  "nftables rules applied",
                  (token) => applyNft(token, dryRun),
                  { dryRunAware: true }
                );
                recordCommand("routing", result);
              }}
              onCleanupNft={async () => {
                if (!confirmAction("Remove korserver-managed nftables rules?")) {
                  return;
                }
                const result = await runAction(
                  "cleanup-nft",
                  "nftables rules cleaned",
                  (token) => cleanupNft(token, dryRun),
                  { dryRunAware: true }
                );
                recordCommand("routing", result);
              }}
              onShowNft={async () => {
                const result = await runAction("show-nft", "nftables state loaded", fetchNft, {
                  reload: false
                });
                recordCommand("routing", result);
              }}
            />
          </div>
        )}
        {upstreamModalOpen && (
          <UpstreamProfileDialog
            key={upstreamDialogKey}
            draft={upstreamDraft}
            isEdit={editingUpstreamProfile}
            busy={busy}
            onDraftChange={setUpstreamDraft}
            onClose={() => setUpstreamModalOpen(false)}
            onSave={handleSaveUpstreamProfile}
          />
        )}
        {upstreamSettingsModalOpen && (
          <UpstreamSettingsDialog
            upstreamInterface={upstreamInterface}
            checkInterval={upstreamCheckInterval}
            checkThreshold={upstreamCheckThreshold}
            failover={upstreamFailover}
            checkHost={upstreamCheckHost}
            hasActiveProfile={Boolean(state.upstream?.active_profile)}
            busy={busy}
            onInterfaceChange={setUpstreamInterface}
            onCheckIntervalChange={setUpstreamCheckInterval}
            onCheckThresholdChange={setUpstreamCheckThreshold}
            onFailoverChange={setUpstreamFailover}
            onCheckHostChange={setUpstreamCheckHost}
            onClose={() => setUpstreamSettingsModalOpen(false)}
            onSave={async (event) => {
              event.preventDefault();
              await handleSaveUpstreamSettings(Boolean(state.upstream?.enabled));
              await handleSaveUpstreamCheckHost();
              setUpstreamSettingsModalOpen(false);
            }}
          />
        )}

        {tab === "config" && configSection === "certificates" && (
          <CertificatesView
            status={state.certificateStatus}
            externalFiles={externalCertFiles}
            caFiles={caFiles}
            caRevokeDraft={caRevokeDraft}
            certificateSettingsDraft={certificateSettingsDraft}
            letsEncryptDraft={letsEncryptDraft}
            busy={busy}
            dryRun={dryRun}
            commandOutput={commandOutputs.certificates ?? null}
            onClearCommand={() => clearCommand("certificates")}
            onExternalFilesChange={setExternalCertFiles}
            onCaFilesChange={setCaFiles}
            onCaRevokeDraftChange={setCaRevokeDraft}
            onCertificateSettingsDraftChange={setCertificateSettingsDraft}
            onSaveCertificateSettings={() => void handleSaveCertificateSettings()}
            onLetsEncryptDraftChange={setLetsEncryptDraft}
            onUploadExternal={handleUploadExternalCertificates}
            onIssueLetsEncrypt={handleIssueLetsEncrypt}
            onRenewLetsEncrypt={() => void handleRenewLetsEncrypt()}
            onSaveLetsEncryptSettings={() => void handleSaveLetsEncryptSettings()}
            onSetLetsEncryptEnabled={(enabled) => void handleSetLetsEncryptEnabled(enabled)}
            onRegenerateCa={async () => {
              if (!confirmAction("Regenerate the CA? Existing client certificates may need reissue.")) {
                return;
              }
              const result = await runAction(
                "ca-regenerate",
                "CA regenerated",
                (token) => regenerateCa(token, dryRun),
                { reload: false, dryRunAware: true }
              );
              recordCommand("certificates", result?.results ?? null);
            }}
            onUploadCa={async () => {
              if (!caFiles.caCert || !caFiles.caKey) {
                setNotice({ kind: "error", text: "select CA certificate and CA private key" });
                return;
              }
              const result = await runAction(
                "ca-upload",
                "CA material uploaded",
                (token) =>
                  uploadCa(token, {
                    caCert: caFiles.caCert as File,
                    caKey: caFiles.caKey as File
                  }),
                { reload: false }
              );
              recordCommand("certificates", result);
              if (result) {
                setCaFiles({ caCert: null, caKey: null });
              }
            }}
            onRevokeCaCert={async () => {
              const result = await runAction(
                "ca-revoke",
                "Certificate revoked",
                (token) =>
                  caRevokeDraft.certificateFile
                    ? revokeCaCertificateFile(token, caRevokeDraft.certificateFile, dryRun)
                    : revokeCaCertificateB64(
                        token,
                        window.btoa(caRevokeDraft.certificateB64.trim()),
                        dryRun
                      ),
                { reload: false, dryRunAware: true }
              );
              recordCommand("certificates", result);
              if (result && !dryRun) {
                setCaRevokeDraft({ certificateB64: "", certificateFile: null });
              }
            }}
            onShowRevokedCerts={async () => {
              setRevokedCertsModal({ loading: true, certificates: [] });
              if (!authToken) {
                return;
              }
              try {
                const { certificates } = await fetchRevokedCertificates(authToken);
                setRevokedCertsModal({ loading: false, certificates });
              } catch {
                setRevokedCertsModal({ loading: false, certificates: [] });
                setNotice({ kind: "error", text: "failed to load revoked certificates" });
              }
            }}
          />
        )}

        {tab === "config" && (
          <ConfigView
            section={configSection}
            config={state.config}
            source={state.configSource}
            draft={configDraft}
            dirty={configDirty}
            rendered={state.renderedConfig}
            diff={configDiff}
            validation={configValidation}
            serverSettingsDraft={serverSettingsDraft}
            authMethodsDraft={authMethodsDraft}
            webSettingsDraft={webSettingsDraft}
            generalSettingsDraft={generalSettingsDraft}
            onServerSettingsDraftChange={setServerSettingsDraft}
            onAuthMethodsDraftChange={setAuthMethodsDraft}
            onWebSettingsDraftChange={setWebSettingsDraft}
            onGeneralSettingsDraftChange={setGeneralSettingsDraft}
            onSaveServerSettings={() => void handleSaveServerSettings()}
            onSaveAuthMethodsSettings={() => void handleSaveAuthMethodsSettings()}
            onSaveWebSettings={() => void handleSaveWebSettings()}
            onSaveGeneralSettings={() => void handleSaveGeneralSettings()}
            busy={busy}
            onDraftChange={(value) => {
              setConfigDraft(value);
              setConfigDirty(true);
            }}
            onReloadSource={() => {
              setConfigDraft(state.configSource?.content ?? "");
              setConfigDirty(false);
              setConfigValidation("");
            }}
            onRender={() => void loadAll(authToken)}
            onValidate={async () => {
              const result = await runAction(
                "config-validate",
                "Config validated",
                (token) => validateConfigSource(token, configDraft),
                { reload: false }
              );
              setConfigValidation(result ? JSON.stringify(result, null, 2) : "");
            }}
            onDiff={async () => {
              const result = await runAction(
                "config-diff",
                "Config diff loaded",
                fetchConfigDiff,
                { reload: false }
              );
              setConfigDiff(result?.diff ?? "");
            }}
            onSave={async () => {
              const result = await runAction(
                "config-save",
                "Config saved",
                (token) => saveConfigSource(token, configDraft, true),
                { reload: false }
              );
              if (result) {
                setConfigDraft(result.content);
                setConfigDirty(false);
                setState((current) => ({
                  ...current,
                  config: result.config,
                  configSource: {
                    path: result.path,
                    exists: true,
                    content: result.content
                  }
                }));
                await loadAll(authToken);
              }
            }}
            onWrite={() =>
              void runAction("write-config", "Generated configs written", writeRenderedConfig)
            }
            onNotice={(kind, text) => setNotice({ kind, text })}
          />
        )}

        {tab === "diagnostics" && <DiagnosticsView diagnostics={state.diagnostics} />}

        {tab === "logs" && (
          <LogsView
            files={state.logFiles}
            request={logRequest}
            live={liveLog}
            logTail={logTail}
            busy={busy}
            rotation={logRotationDraft}
            onRequestChange={setLogRequest}
            onLiveChange={setLiveLog}
            onFetch={handleFetchLog}
            onRotationChange={setLogRotationDraft}
            onSaveRotation={() => void handleSaveLogRotation()}
            onRotateNow={() => void handleRunLogRotation()}
          />
        )}

        {terminalEnabled && (
          <Suspense fallback={<section className="panel">Loading terminal...</section>}>
            <div className={tab === "terminal" ? "tab-pane" : "tab-pane tab-pane-hidden"}>
              <TerminalView
                authToken={authToken}
                theme={theme}
                onNotice={(kind, text) => setNotice({ kind, text })}
              />
            </div>
          </Suspense>
        )}
      </section>
      {userConfigModal && (
        <UserConfigDialog
          busy={busy}
          state={userConfigModal}
          onChange={(draft) =>
            setUserConfigModal((current) => (current ? { ...current, draft } : current))
          }
          onClose={() => setUserConfigModal(null)}
          onDelete={async () => {
            const username = userConfigModal.username;
            if (!confirmAction(`Clear per-user config for ${username}?`)) {
              return;
            }
            const result = await runAction(
              `user-config-delete-${username}`,
              `Config cleared for ${username}`,
              (token) => deleteUserConfig(token, username),
              { reload: false }
            );
            recordCommand("users", result);
            if (result) {
              setUserConfigModal(null);
            }
          }}
          onSave={async () => {
            const { username, draft } = userConfigModal;
            const result = await runAction(
              `user-config-save-${username}`,
              `Config saved for ${username}`,
              (token) => saveUserConfig(token, username, normalizeUserConfigDraft(draft)),
              { reload: false }
            );
            recordCommand("users", result);
            if (result) {
              setUserConfigModal(null);
            }
          }}
        />
      )}
      {p12Base64Modal && (
        <P12Base64Dialog state={p12Base64Modal} onClose={() => setP12Base64Modal(null)} />
      )}
      {revokedCertsModal && (
        <RevokedCertsDialog state={revokedCertsModal} onClose={() => setRevokedCertsModal(null)} />
      )}
      {userGroupsModal && (
        <UserGroupsDialog
          availableGroups={state.groups}
          busy={busy}
          state={userGroupsModal}
          onChange={(groups) =>
            setUserGroupsModal((current) => (current ? { ...current, groups } : current))
          }
          onClose={() => setUserGroupsModal(null)}
          onCreateGroup={() => {
            setUserGroupsModal(null);
            setTab("groups");
          }}
          onSave={async () => {
            const { username, groups } = userGroupsModal;
            const result = await runAction(
              `user-groups-${username}`,
              `Groups saved for ${username}`,
              (token) => saveUserGroups(token, username, groups),
              { reload: false }
            );
            recordCommand("users", result);
            if (result !== null && authToken) {
              const users = await fetchUsers(authToken);
              setState((current) => ({ ...current, users }));
              setUserGroupsModal(null);
            }
          }}
        />
      )}
      {groupConfigModal && (
        <UserConfigDialog
          busy={busy}
          state={{ username: groupConfigModal.name, draft: groupConfigModal.draft }}
          title={`${groupConfigModal.name} group config`}
          saveBusyKey={`group-config-save-${groupConfigModal.name}`}
          deleteBusyKey={`group-config-delete-${groupConfigModal.name}`}
          onChange={(draft) =>
            setGroupConfigModal((current) => (current ? { ...current, draft } : current))
          }
          onClose={() => setGroupConfigModal(null)}
          onDelete={async () => {
            const name = groupConfigModal.name;
            if (!confirmAction(`Clear config for group ${name}?`)) {
              return;
            }
            const result = await runAction(
              `group-config-delete-${name}`,
              `Config cleared for ${name}`,
              (token) => deleteGroupConfig(token, name),
              { reload: false }
            );
            recordCommand("groups", result);
            if (result && authToken) {
              setGroupConfigModal(null);
              const groups = await fetchGroups(authToken);
              setState((current) => ({ ...current, groups }));
            }
          }}
          onSave={async () => {
            const { name, draft } = groupConfigModal;
            const result = await runAction(
              `group-config-save-${name}`,
              `Config saved for ${name}`,
              (token) => saveGroupConfig(token, name, normalizeUserConfigDraft(draft)),
              { reload: false }
            );
            recordCommand("groups", result);
            if (result && authToken) {
              setGroupConfigModal(null);
              setNewGroupName(name);
              const groups = await fetchGroups(authToken);
              setState((current) => ({ ...current, groups }));
            }
          }}
        />
      )}
      {groupMembersModal && (
        <GroupMembersDialog
          busy={busy}
          state={groupMembersModal}
          users={state.users}
          onChange={(users) =>
            setGroupMembersModal((current) => (current ? { ...current, users } : current))
          }
          onClose={() => setGroupMembersModal(null)}
          onSave={async () => {
            const { name, users } = groupMembersModal;
            const selected = new Set(users);
            const result = await runAction(
              `group-members-${name}`,
              `Members saved for ${name}`,
              async (token) => {
                // Sequential on purpose: each request rewrites the shared
                // passwd file server-side, so parallel updates can race and
                // drop each other's changes.
                const results: CommandResult[] = [];
                for (const user of state.users) {
                  const currentGroups = user.groups ?? [];
                  const hasGroup = currentGroups.includes(name);
                  const shouldHaveGroup = selected.has(user.username);
                  if (hasGroup === shouldHaveGroup) {
                    continue;
                  }
                  const nextGroups = shouldHaveGroup
                    ? [...currentGroups, name]
                    : currentGroups.filter((group) => group !== name);
                  results.push(await saveUserGroups(token, user.username, nextGroups));
                }
                return results[0] ?? syntheticCommand(["korctl", "user", "groups"], "unchanged");
              },
              { reload: false }
            );
            recordCommand("groups", result);
            if (result !== null && authToken) {
              const loadedUsers = await fetchUsers(authToken);
              setState((current) => ({ ...current, users: loadedUsers }));
              setGroupMembersModal(null);
            }
          }}
        />
      )}
      {notice && (
        <NoticeToast
          notice={notice}
          onClose={() => setNotice(null)}
          onPauseChange={setNoticePaused}
        />
      )}
    </main>
  );
}

function LoginScreen({
  form,
  busy,
  notice,
  theme,
  totpRequired,
  onChange,
  onSubmit,
  onToggleTheme
}: {
  form: { username: string; password: string; totpCode: string };
  busy: boolean;
  notice: Notice;
  theme: Theme;
  totpRequired: boolean;
  onChange: (value: { username: string; password: string; totpCode: string }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleTheme: () => void;
}) {
  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={onSubmit}>
        <div className="login-header">
          <div className="brand login-brand">
            <RavenMark />
            <strong>Korvus Server</strong>
          </div>
          <IconButton
            label={theme === "dark" ? "Light theme" : "Dark theme"}
            icon={theme === "dark" ? Sun : Moon}
            onClick={onToggleTheme}
          />
        </div>
        <label>
          <span>Username</span>
          <input
            autoComplete="username"
            value={form.username}
            onChange={(event) => onChange({ ...form, username: event.target.value })}
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete="current-password"
            type="password"
            value={form.password}
            onChange={(event) => onChange({ ...form, password: event.target.value })}
            required
          />
        </label>
        {totpRequired && (
          <label>
            <span>Authenticator code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={form.totpCode}
              onChange={(event) => onChange({ ...form, totpCode: event.target.value })}
              autoFocus
              required
            />
          </label>
        )}
        {notice && <span className={`status ${notice.kind}`}>{notice.text}</span>}
        <button className="primary-button" disabled={busy} type="submit">
          <KeyRound size={18} aria-hidden="true" />
          <span>{busy ? "Signing in" : "Sign in"}</span>
        </button>
      </form>
    </main>
  );
}

function DashboardView({
  state,
  diagnosticScore,
  busy,
  interfaceName,
  interfaceHistory,
  onStartServer,
  onStopServer,
  onReloadServer,
  onRestartServer,
  onWriteConfig,
  onApplyNft,
  commandOutput,
  onClearCommand
}: {
  state: AppState;
  diagnosticScore: { ok: number; total: number };
  busy: string | null;
  interfaceName: string | null;
  interfaceHistory: InterfaceRatePoint[];
  onStartServer: () => void;
  onStopServer: () => void;
  onReloadServer: () => void;
  onRestartServer: () => void;
  onWriteConfig: () => void;
  onApplyNft: () => void;
  commandOutput: CommandResult | CommandResult[] | null;
  onClearCommand: () => void;
}) {
  const runtimeState = serverRuntimeState(state.serverStatus);
  const serverRunning = runtimeState === "running";
  const serverStopped = runtimeState === "stopped";
  const processCount = dashboardProcessCount(state);
  const nftFilter = state.diagnostics?.["nft filter table"];
  const nftNat = state.diagnostics?.["nft nat table"];
  const nftReady =
    Boolean(nftFilter && nftNat) &&
    diagnosticKind(nftFilter as CommandResult) !== "error" &&
    diagnosticKind(nftNat as CommandResult) !== "error";

  return (
    <div className="view-stack">
      <section className="metric-grid">
        <Metric label="Users" value={state.users.length.toString()} />
        <Metric label="Sessions" value={state.sessions.length.toString()} />
        <Metric label="Routes" value={state.routes.length.toString()} />
        <Metric label="Diagnostics" value={`${diagnosticScore.ok}/${diagnosticScore.total}`} />
        <Metric
          label="Processes"
          value={`${processCount.running}/${processCount.total}`}
        />
        <Metric label="Firewall/NAT" value={nftReady ? "Ready" : "Check rules"} />
        <Metric label="Logs" value={state.logFiles.length.toString()} />
        <Metric label="Config" value={state.configSource?.exists ? "Persistent" : "Default"} />
      </section>
      <InterfaceLoadPanel name={interfaceName} history={interfaceHistory} />
      <section className="panel">
        <div className="panel-header">
          <h2>Korvus Server</h2>
          <div className="toolbar">
            <Pill kind={serverRunning ? "ok" : serverStopped ? "muted" : "warning"}>
              {serverRunning ? "Running" : serverStopped ? "Stopped" : "Unknown"}
            </Pill>
            <ActionButton
              label="Start"
              icon={Play}
              disabled={serverRunning}
              busy={busy === "start-server"}
              onClick={onStartServer}
            />
            <ActionButton
              label="Stop"
              icon={Square}
              danger
              disabled={!serverRunning}
              busy={busy === "stop-server"}
              onClick={onStopServer}
            />
            <ActionButton
              label="Reload"
              icon={RefreshCw}
              disabled={!serverRunning}
              busy={busy === "reload-server"}
              onClick={onReloadServer}
            />
            <ActionButton
              label="Restart ocserv"
              icon={RefreshCw}
              danger
              disabled={!serverRunning}
              busy={busy === "restart-server"}
              onClick={onRestartServer}
            />
            <ActionButton
              label="Render configs"
              icon={Save}
              title="Write generated Korvus Server, supervisor, dnsmasq and nftables files from YAML"
              busy={busy === "write-config"}
              onClick={onWriteConfig}
            />
            <ActionButton
              label="Apply firewall/NAT"
              icon={Terminal}
              title="Apply generated nftables firewall, split-routing and VPN masquerade rules"
              busy={busy === "apply-nft"}
              onClick={onApplyNft}
            />
          </div>
        </div>
        <CommandBlock result={state.serverStatus} />
      </section>
      {commandOutput && (
        <LastCommandPanel title="Last command" result={commandOutput} onClose={onClearCommand} />
      )}
      <section className="panel software-panel">
        <div className="panel-header">
          <h2>Software versions</h2>
          <Pill kind={state.softwareVersions.length > 0 ? "ok" : "muted"}>
            {state.softwareVersions.length.toString()}
          </Pill>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Version</th>
                <th>Probe</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.softwareVersions.map((item) => (
                <tr key={item.name}>
                  <td className="strong-cell">{item.name}</td>
                  <td>{item.version}</td>
                  <td>
                    <code>{item.command?.join(" ") ?? "built-in"}</code>
                  </td>
                  <td>
                    <Pill
                      kind={
                        item.status === "ok"
                          ? "ok"
                          : item.status === "missing"
                            ? "warning"
                            : "muted"
                      }
                    >
                      {item.status}
                    </Pill>
                  </td>
                </tr>
              ))}
              {state.softwareVersions.length === 0 && (
                <tr>
                  <td colSpan={4}>No version data loaded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function InterfaceLoadPanel({
  name,
  history
}: {
  name: string | null;
  history: InterfaceRatePoint[];
}) {
  const latest = history[history.length - 1];
  const rxValues = history.map((point) => point.rx);
  const txValues = history.map((point) => point.tx);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Interface load</h2>
        <Pill kind={name ? "ok" : "muted"}>{name ?? "unresolved"}</Pill>
      </div>
      <div className="interface-graph">
        <div className="interface-graph-row">
          <span className="interface-graph-label">RX</span>
          <span className="interface-graph-value">
            {latest ? `${formatBytes(latest.rx)}/s` : "-"}
          </span>
          <Sparkline values={rxValues} />
        </div>
        <div className="interface-graph-row">
          <span className="interface-graph-label">TX</span>
          <span className="interface-graph-value">
            {latest ? `${formatBytes(latest.tx)}/s` : "-"}
          </span>
          <Sparkline values={txValues} />
        </div>
      </div>
    </section>
  );
}

const SPARKLINE_BLOCKS = "▁▂▃▄▅▆▇█";

function sparklineChar(value: number, max: number): string {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const index = Math.round(ratio * (SPARKLINE_BLOCKS.length - 1));
  return SPARKLINE_BLOCKS[index];
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <span className="interface-graph-spark empty">waiting for samples...</span>;
  }
  const max = Math.max(...values, 1);
  return (
    <span className="interface-graph-spark" role="img" aria-label="throughput history">
      {values.map((value, index) => (
        <span key={index}>{sparklineChar(value, max)}</span>
      ))}
    </span>
  );
}

function serverRuntimeState(result: CommandResult | null): "running" | "stopped" | "unknown" {
  if (!result) {
    return "unknown";
  }
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (/\bocserv\s+running\b/.test(text)) {
    return "running";
  }
  if (/\bocserv\s+(stopped|exited|fatal|backoff|unknown)\b/.test(text)) {
    return "stopped";
  }
  return "unknown";
}

function dashboardProcessCount(state: AppState): { running: number; total: number } {
  if (state.serverProcesses.length > 0) {
    return {
      running: state.serverProcesses.filter((process) => process.state === "RUNNING").length,
      total: state.serverProcesses.length
    };
  }
  return serverStatusProcessCount(state.serverStatus);
}

function serverStatusProcessCount(result: CommandResult | null): { running: number; total: number } {
  const processLines = (result?.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\b(?:RUNNING|STOPPED|FATAL|BACKOFF|STARTING)\b/.test(line));
  return {
    running: processLines.filter((line) => /\bRUNNING\b/.test(line)).length,
    total: processLines.length
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function confirmAction(message: string): boolean {
  return window.confirm(message);
}

function RavenMark() {
  return <img alt="" aria-hidden="true" className="raven-mark" src="/favicon.svg" />;
}

function splitLines(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readRoutingDraft(config: Record<string, unknown>): {
  mode: string;
  tunnelDns: boolean;
  hostTraffic: boolean;
  dnsmasqListen: string;
  dnsmasqPort: number;
  mainInterface: string;
  fwmark: string;
  tableId: number;
  nftPrefix: string;
} {
  const routing = readRecord(config.routing);
  const split = readRecord(routing.split);
  return {
    mode: readString(routing.mode, "full"),
    tunnelDns: readBoolean(split.tunnel_dns, false),
    hostTraffic: readBoolean(split.host_traffic, false),
    dnsmasqListen: readString(split.dnsmasq_listen, "10.10.10.1"),
    dnsmasqPort: readNumber(split.dnsmasq_port, 53),
    mainInterface: readString(routing.main_interface, "auto"),
    fwmark: readString(routing.fwmark, "0x0c01"),
    tableId: readNumber(routing.table_id, 1201),
    nftPrefix: readString(routing.nft_prefix, "korserver")
  };
}

function readOidcDraft(identity: IdentityStatus): OidcDraft {
  return {
    enabled: identity.auth.enabled,
    connector: identity.auth.connector,
    pamService: identity.auth.pam.service,
    pamGidMin: identity.auth.pam.gid_min === null ? "" : String(identity.auth.pam.gid_min),
    radiusConfigFile: identity.auth.radius.config_file,
    radiusGroupconfig: identity.auth.radius.groupconfig,
    radiusNasIdentifier: identity.auth.radius.nas_identifier ?? "",
    radiusGroupSeparator: identity.auth.radius.group_separator,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

type ServerSettingsDraft = {
  enabled: boolean;
  listen: string;
  port: number;
  udpEnabled: boolean;
  device: string;
  cn: string;
  realm: string;
  ipv4Network: string;
  dns: string;
  searchDomains: string;
  routes: string;
  noRoutes: string;
  maxClients: number;
  maxSameClients: number;
  keepalive: number;
  compression: boolean;
  ciscoClientCompat: boolean;
  camouflageEnabled: boolean;
  camouflageSecret: string;
  camouflageRealm: string;
  connectScript: string;
  disconnectScript: string;
  debugLevel: number;
};

function readServerSettingsDraft(config: Record<string, unknown>): ServerSettingsDraft {
  const server = readRecord(config.server);
  const camouflage = readRecord(server.camouflage);
  return {
    enabled: readBoolean(server.enabled, true),
    listen: readString(server.listen, "0.0.0.0"),
    port: readNumber(server.port, 443),
    udpEnabled: readBoolean(server.udp_enabled, true),
    device: readString(server.device, "vpns"),
    cn: readString(server.cn, "vpn.example.com"),
    realm: readString(server.realm, "Korvus VPN Server"),
    ipv4Network: readString(server.ipv4_network, "10.10.10.0/24"),
    dns: readStringArray(server.dns).join("\n"),
    searchDomains: readStringArray(server.search_domains).join("\n"),
    routes: readStringArray(server.routes).join("\n"),
    noRoutes: readStringArray(server.no_routes).join("\n"),
    maxClients: readNumber(server.max_clients, 128),
    maxSameClients: readNumber(server.max_same_clients, 2),
    keepalive: readNumber(server.keepalive, 32400),
    compression: readBoolean(server.compression, false),
    ciscoClientCompat: readBoolean(server.cisco_client_compat, true),
    camouflageEnabled: readBoolean(camouflage.enabled, false),
    camouflageSecret: readString(camouflage.secret, ""),
    camouflageRealm: readString(camouflage.realm, "Hidden service"),
    connectScript: readString(server.connect_script, ""),
    disconnectScript: readString(server.disconnect_script, ""),
    debugLevel: readNumber(server.debug_level, 1)
  };
}

type AuthMethodsDraft = {
  passwordEnabled: boolean;
  certificateEnabled: boolean;
  otpEnabled: boolean;
  otpOcservOathAuth: boolean;
  otpIssuer: string;
  otpSendByEmail: boolean;
  otpSendByTelegram: boolean;
};

function readAuthMethodsDraft(config: Record<string, unknown>): AuthMethodsDraft {
  const auth = readRecord(config.auth);
  const password = readRecord(auth.password);
  const certificate = readRecord(auth.certificate);
  const otp = readRecord(auth.otp);
  return {
    passwordEnabled: readBoolean(password.enabled, true),
    certificateEnabled: readBoolean(certificate.enabled, false),
    otpEnabled: readBoolean(otp.enabled, false),
    otpOcservOathAuth: readBoolean(otp.ocserv_oath_auth, false),
    otpIssuer: readString(otp.issuer, "Korvus Server"),
    otpSendByEmail: readBoolean(otp.send_by_email, false),
    otpSendByTelegram: readBoolean(otp.send_by_telegram, false)
  };
}

type WebSettingsDraft = {
  enabled: boolean;
  listen: string;
  port: number;
  tls: boolean;
  allowInsecureHttp: boolean;
  trustedProxies: string;
  adminUser: string;
  terminalEnabled: boolean;
  terminalIdleTimeout: number;
  terminalMaxSessions: number;
  sessionLifetime: number;
  sessionCookieSecure: boolean;
};

function readWebSettingsDraft(config: Record<string, unknown>): WebSettingsDraft {
  const web = readRecord(config.web);
  return {
    enabled: readBoolean(web.enabled, false),
    listen: readString(web.listen, "127.0.0.1"),
    port: readNumber(web.port, 8443),
    tls: readBoolean(web.tls, true),
    allowInsecureHttp: readBoolean(web.allow_insecure_http, false),
    trustedProxies: readStringArray(web.trusted_proxies).join("\n"),
    adminUser: readString(web.admin_user, "admin"),
    terminalEnabled: readBoolean(web.terminal_enabled, false),
    terminalIdleTimeout: readNumber(web.terminal_idle_timeout, 900),
    terminalMaxSessions: readNumber(web.terminal_max_sessions, 2),
    sessionLifetime: readNumber(web.session_lifetime, 43200),
    sessionCookieSecure: readBoolean(web.session_cookie_secure, true)
  };
}

type GeneralSettingsDraft = {
  timezone: string;
  logLevel: "debug" | "info" | "warning" | "error";
  projectName: string;
  cliEnabled: boolean;
};

function readGeneralSettingsDraft(config: Record<string, unknown>): GeneralSettingsDraft {
  const system = readRecord(config.system);
  const cli = readRecord(config.cli);
  const logLevel = system.log_level;
  return {
    timezone: readString(system.timezone, "UTC"),
    logLevel:
      logLevel === "debug" || logLevel === "warning" || logLevel === "error" ? logLevel : "info",
    projectName: readString(system.project_name, "korserver"),
    cliEnabled: readBoolean(cli.enabled, true)
  };
}

function UsersView({
  users,
  otpRecords,
  busy,
  newUser,
  passwordDrafts,
  p12Drafts,
  commandOutput,
  onClearCommand,
  onNewUserChange,
  onPasswordDraftChange,
  onP12DraftChange,
  onCreate,
  onChangePassword,
  onEnable,
  onDelete,
  onOtp,
  onOtpQr,
  onCert,
  onRevokeCert,
  onP12,
  onDownloadP12,
  onDownloadCert,
  onDownloadKey,
  onViewP12Base64,
  onOpenConfig,
  onOpenGroups
}: {
  users: UserRecord[];
  otpRecords: OtpRecord[];
  busy: string | null;
  newUser: { username: string; password: string };
  passwordDrafts: Record<string, string>;
  p12Drafts: Record<string, P12Draft>;
  commandOutput: CommandResult | CommandResult[] | null;
  onClearCommand: () => void;
  onNewUserChange: (value: { username: string; password: string }) => void;
  onPasswordDraftChange: (username: string, value: string) => void;
  onP12DraftChange: (username: string, value: Partial<P12Draft>) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onChangePassword: (username: string) => void;
  onEnable: (username: string, enabled: boolean) => void;
  onDelete: (username: string) => void;
  onOtp: (username: string, enabled: boolean) => void;
  onOtpQr: (username: string) => void;
  onCert: (username: string) => void;
  onRevokeCert: (username: string) => void;
  onP12: (username: string) => void;
  onDownloadP12: (username: string) => void;
  onDownloadCert: (username: string) => void;
  onDownloadKey: (username: string) => void;
  onViewP12Base64: (username: string) => void;
  onOpenConfig: (username: string) => void;
  onOpenGroups: (username: string) => void;
}) {
  const otpEnabled = new Set(otpRecords.map((record) => record.username));
  return (
    <div className="view-stack">
      <section className="panel user-create-panel">
        <form className="inline-form" onSubmit={onCreate}>
          <label>
            <span>Username</span>
            <input
              value={newUser.username}
              onChange={(event) => onNewUserChange({ ...newUser, username: event.target.value })}
              required
            />
          </label>
          <div className="inline-tools password-tools password-tools-compact">
            <label>
              <span>Password</span>
              <input
                type="password"
                value={newUser.password}
                onChange={(event) => onNewUserChange({ ...newUser, password: event.target.value })}
                required
              />
            </label>
            <PasswordGeneratorButton
              onApply={(password) => onNewUserChange({ ...newUser, password })}
            />
          </div>
          <button className="primary-button" disabled={busy === "create-user"} type="submit">
            <Plus size={18} aria-hidden="true" />
            <span>Create</span>
          </button>
        </form>
      </section>

      {users.length === 0 ? (
        <section className="panel">
          <EmptyState text="No users" />
        </section>
      ) : (
        <section className="panel users-panel">
          <Table
            columns={[
              "Username",
              "Access",
              "Password",
              "OTP",
              "Certificate",
              "PKCS#12",
              "Config"
            ]}
            empty="No users"
          >
            {users.map((user) => {
              const p12 = p12DraftFor(p12Drafts, user.username);
              const hasOtp = otpEnabled.has(user.username);
              return (
                <tr key={user.username}>
                  <td className="strong-cell user-name-cell">{user.username}</td>
                  <td>
                    <div className="inline-tools account-tools">
                      <Pill kind={user.disabled ? "muted" : "ok"}>
                        {user.disabled ? "Disabled" : "Enabled"}
                      </Pill>
                      <IconButton
                        label={user.disabled ? "Enable user" : "Disable user"}
                        icon={user.disabled ? Power : Ban}
                        busy={busy === `${user.disabled ? "enable" : "disable"}-${user.username}`}
                        onClick={() => onEnable(user.username, user.disabled)}
                      />
                      <IconButton
                        label="Delete user"
                        icon={Trash2}
                        danger
                        busy={busy === `delete-${user.username}`}
                        onClick={() => onDelete(user.username)}
                      />
                      <IconButton
                        label="Groups"
                        icon={Users}
                        busy={busy === `user-groups-${user.username}`}
                        onClick={() => onOpenGroups(user.username)}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="inline-tools password-tools">
                      <input
                        type="password"
                        value={passwordDrafts[user.username] ?? ""}
                        onChange={(event) =>
                          onPasswordDraftChange(user.username, event.target.value)
                        }
                        placeholder="New password"
                      />
                      <PasswordGeneratorButton
                        onApply={(password) => onPasswordDraftChange(user.username, password)}
                      />
                      <IconButton
                        label="Change password"
                        icon={KeyRound}
                        disabled={!passwordDrafts[user.username]}
                        busy={busy === `password-${user.username}`}
                        onClick={() => onChangePassword(user.username)}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="inline-tools">
                      <Pill kind={hasOtp ? "ok" : "muted"}>{hasOtp ? "On" : "Off"}</Pill>
                      <IconButton
                        label="Enable OTP"
                        icon={Clock}
                        disabled={hasOtp}
                        busy={busy === `otp-on-${user.username}`}
                        onClick={() => onOtp(user.username, true)}
                      />
                      <IconButton
                        label="Disable OTP"
                        icon={Power}
                        disabled={!hasOtp}
                        busy={busy === `otp-off-${user.username}`}
                        onClick={() => onOtp(user.username, false)}
                      />
                      <IconButton
                        label="Show OTP QR"
                        icon={QrCode}
                        disabled={!hasOtp}
                        busy={busy === `otp-qr-${user.username}`}
                        onClick={() => onOtpQr(user.username)}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="inline-tools">
                      <IconButton
                        label="Issue certificate"
                        icon={CheckCircle2}
                        disabled={user.certificate_exists}
                        busy={busy === `cert-${user.username}`}
                        onClick={() => onCert(user.username)}
                      />
                      <IconButton
                        label="Revoke certificate"
                        icon={Ban}
                        danger
                        disabled={!user.certificate_exists}
                        busy={busy === `revoke-cert-${user.username}`}
                        onClick={() => onRevokeCert(user.username)}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="inline-tools p12-tools">
                      <input
                        type="password"
                        value={p12.passphrase}
                        onChange={(event) =>
                          onP12DraftChange(user.username, { passphrase: event.target.value })
                        }
                        placeholder="Passphrase"
                      />
                      <PasswordGeneratorButton
                        onApply={(password) =>
                          onP12DraftChange(user.username, { passphrase: password })
                        }
                      />
                      <label
                        className="mini-check"
                        title="Generate a macOS/iOS-compatible PKCS#12 bundle"
                      >
                        <input
                          checked={p12.appleCompatible}
                          onChange={(event) =>
                            onP12DraftChange(user.username, {
                              appleCompatible: event.target.checked
                            })
                          }
                          type="checkbox"
                        />
                        <span>Apple</span>
                      </label>
                      <div className="p12-actions">
                        <IconButton
                          label="Create PKCS#12"
                          icon={Save}
                          disabled={!user.certificate_exists}
                          busy={busy === `p12-${user.username}`}
                          onClick={() => onP12(user.username)}
                        />
                        <IconButton
                          label="Download PKCS#12"
                          icon={Download}
                          disabled={!user.p12_exists}
                          busy={busy === `download-p12-${user.username}`}
                          onClick={() => onDownloadP12(user.username)}
                        />
                        <IconButton
                          label="Download certificate"
                          icon={Download}
                          disabled={!user.certificate_exists}
                          busy={busy === `download-cert-${user.username}`}
                          onClick={() => onDownloadCert(user.username)}
                        />
                        <IconButton
                          label="Download private key"
                          icon={Download}
                          disabled={!user.certificate_exists}
                          busy={busy === `download-key-${user.username}`}
                          onClick={() => onDownloadKey(user.username)}
                        />
                        <IconButton
                          label="View PKCS#12 as Base64"
                          icon={Eye}
                          disabled={!user.p12_exists}
                          busy={busy === `view-p12-base64-${user.username}`}
                          onClick={() => onViewP12Base64(user.username)}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <IconButton
                      label="Per-user config"
                      icon={FileSliders}
                      busy={busy === `user-config-load-${user.username}`}
                      onClick={() => onOpenConfig(user.username)}
                    />
                  </td>
                </tr>
              );
            })}
          </Table>
        </section>
      )}
      {commandOutput && (
        <LastCommandPanel title="Last user command" result={commandOutput} onClose={onClearCommand} />
      )}
    </div>
  );
}

function UserGroupsDialog({
  state,
  availableGroups,
  busy,
  onChange,
  onClose,
  onCreateGroup,
  onSave
}: {
  state: UserGroupsModalState;
  availableGroups: GroupConfigRecord[];
  busy: string | null;
  onChange: (groups: string[]) => void;
  onClose: () => void;
  onCreateGroup: () => void;
  onSave: () => void;
}) {
  if (!state) {
    return null;
  }
  const selected = new Set(state.groups);
  const saving = busy === `user-groups-${state.username}`;
  const toggle = (group: string) => {
    const next = selected.has(group)
      ? state.groups.filter((item) => item !== group)
      : [...state.groups, group];
    onChange(next);
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel group-dialog" role="dialog" aria-modal="true">
        <div className="panel-header">
          <h2>{state.username} groups</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        {availableGroups.length === 0 ? (
          <div className="empty-state group-empty-state">
            <p>No groups yet.</p>
            <ActionButton label="Open Groups" icon={Users} onClick={onCreateGroup} />
          </div>
        ) : (
          <div className="group-choice-list">
            {availableGroups.map((group) => (
              <label className="group-choice" key={group.name}>
                <input
                  checked={selected.has(group.name)}
                  onChange={() => toggle(group.name)}
                  type="checkbox"
                />
                <span>{group.name}</span>
                <Pill kind={group.has_settings ? "ok" : "muted"}>
                  {group.has_settings ? "Configured" : "Empty"}
                </Pill>
              </label>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <ActionButton label="Clear" icon={Trash2} danger onClick={() => onChange([])} />
          <button
            className="primary-button"
            disabled={saving || availableGroups.length === 0}
            onClick={onSave}
            type="button"
          >
            <Save size={18} aria-hidden="true" />
            <span>{saving ? "Working" : "Save"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function P12Base64Dialog({
  state,
  onClose
}: {
  state: P12Base64ModalState;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"line" | "block" | null>(null);
  if (!state) {
    return null;
  }
  const singleLine = state.base64.replace(/\s+/g, "");
  // Matches the line wrapping of the Linux `base64` utility (76 columns per
  // line, trailing newline), so pasting this output elsewhere behaves the
  // same as piping the file through `base64`.
  const wrapped = `${singleLine.replace(/(.{76})/g, "$1\n")}\n`;
  const copyToClipboard = async (variant: "line" | "block") => {
    try {
      await navigator.clipboard.writeText(variant === "line" ? singleLine : wrapped);
      setCopied(variant);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the text is still
      // selectable in the textarea below.
    }
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel p12-base64-dialog" role="dialog" aria-modal="true">
        <div className="panel-header">
          <h2>{state.username}.p12 (Base64)</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <textarea
          className="p12-base64-textarea"
          readOnly
          value={wrapped}
          onFocus={(event) => event.target.select()}
        />
        <p className="muted-line">
          One line suits env vars (KORCLIENT_AUTH__P12_BASE64) and .env files; the wrapped
          block matches the `base64` utility output for YAML or shell pipelines.
        </p>
        <div className="modal-actions">
          <button
            className="primary-button"
            onClick={() => void copyToClipboard("line")}
            type="button"
          >
            <Copy size={18} aria-hidden="true" />
            <span>{copied === "line" ? "Copied" : "Copy one line"}</span>
          </button>
          <button
            className="primary-button"
            onClick={() => void copyToClipboard("block")}
            type="button"
          >
            <Copy size={18} aria-hidden="true" />
            <span>{copied === "block" ? "Copied" : "Copy block"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function RevokedCertsDialog({
  state,
  onClose
}: {
  state: RevokedCertsModalState;
  onClose: () => void;
}) {
  if (!state) {
    return null;
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel revoked-certs-dialog" role="dialog" aria-modal="true">
        <div className="panel-header">
          <h2>Revoked certificates</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        {state.loading ? (
          <p className="muted-line">Loading…</p>
        ) : state.certificates.length === 0 ? (
          <p className="muted-line">No certificates have been revoked.</p>
        ) : (
          <div className="table-wrap">
            <table className="revoked-certs-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Serial</th>
                  <th>Not before</th>
                  <th>Not after</th>
                </tr>
              </thead>
              <tbody>
                {state.certificates.map((cert, index) => (
                  <tr key={`${cert.serial}-${index}`}>
                    <td>{cert.subject || "—"}</td>
                    <td>{cert.serial || "—"}</td>
                    <td>{cert.not_before || "—"}</td>
                    <td>{cert.not_after || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function GroupsView({
  groups,
  users,
  name,
  busy,
  commandOutput,
  onClearCommand,
  onNameChange,
  onCreate,
  onOpenConfig,
  onDeleteConfig,
  onDeleteGroup,
  onOpenMembers
}: {
  groups: GroupConfigRecord[];
  users: UserRecord[];
  name: string;
  busy: string | null;
  commandOutput: CommandOutput;
  onClearCommand: () => void;
  onNameChange: (value: string) => void;
  onCreate: () => void;
  onOpenConfig: (name: string) => void;
  onDeleteConfig: (name: string) => void;
  onDeleteGroup: (name: string) => void;
  onOpenMembers: (name: string) => void;
}) {
  return (
    <div className="view-stack">
      <section className="panel user-create-panel">
        <div className="inline-form group-create-form">
          <label>
            <span>Group name</span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="devops"
            />
          </label>
          <button className="primary-button" type="button" onClick={onCreate}>
            <Plus size={18} aria-hidden="true" />
            <span>Create config</span>
          </button>
        </div>
      </section>
      <section className="panel">
        <Table columns={["Group", "Members", "Config", "Actions"]} empty="No groups">
          {groups.map((group) => (
            <tr key={group.name}>
              <td className="strong-cell">{group.name}</td>
              <td>
                {users.filter((user) => (user.groups ?? []).includes(group.name)).length}
              </td>
              <td>
                <Pill kind={group.has_settings ? "ok" : "muted"}>
                  {group.has_settings ? "Configured" : "Empty"}
                </Pill>
              </td>
              <td>
                <div className="inline-tools">
                  <IconButton
                    label="Members"
                    icon={Users}
                    busy={busy === `group-members-${group.name}`}
                    onClick={() => onOpenMembers(group.name)}
                  />
                  <IconButton
                    label="Group config"
                    icon={FileSliders}
                    busy={busy === `group-config-load-${group.name}`}
                    onClick={() => onOpenConfig(group.name)}
                  />
                  <IconButton
                    label="Clear group config"
                    icon={Eraser}
                    disabled={!group.config_exists}
                    busy={busy === `group-config-delete-${group.name}`}
                    onClick={() => onDeleteConfig(group.name)}
                  />
                  <IconButton
                    label="Delete group"
                    icon={Trash2}
                    danger
                    busy={busy === `group-delete-${group.name}`}
                    onClick={() => onDeleteGroup(group.name)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </section>
      {commandOutput && (
        <LastCommandPanel title="Last group command" result={commandOutput} onClose={onClearCommand} />
      )}
    </div>
  );
}

function GroupMembersDialog({
  state,
  users,
  busy,
  onChange,
  onClose,
  onSave
}: {
  state: GroupMembersModalState;
  users: UserRecord[];
  busy: string | null;
  onChange: (users: string[]) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!state) {
    return null;
  }
  const selected = new Set(state.users);
  const saving = busy === `group-members-${state.name}`;
  const toggle = (username: string) => {
    const next = selected.has(username)
      ? state.users.filter((item) => item !== username)
      : [...state.users, username];
    onChange(next);
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel group-dialog" role="dialog" aria-modal="true">
        <div className="panel-header">
          <h2>{state.name} members</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        {users.length === 0 ? (
          <EmptyState text="No users" />
        ) : (
          <div className="group-choice-list">
            {users.map((user) => (
              <label className="group-choice" key={user.username}>
                <input
                  checked={selected.has(user.username)}
                  onChange={() => toggle(user.username)}
                  type="checkbox"
                />
                <span>{user.username}</span>
                <Pill kind={user.disabled ? "muted" : "ok"}>
                  {user.disabled ? "Disabled" : "Enabled"}
                </Pill>
              </label>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <ActionButton label="Clear" icon={Trash2} danger onClick={() => onChange([])} />
          <button
            className="primary-button"
            disabled={saving || users.length === 0}
            onClick={onSave}
            type="button"
          >
            <Save size={18} aria-hidden="true" />
            <span>{saving ? "Working" : "Save"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function UserConfigDialog({
  state,
  busy,
  title,
  saveBusyKey,
  deleteBusyKey,
  onChange,
  onClose,
  onDelete,
  onSave
}: {
  state: UserConfigModalState;
  busy: string | null;
  title?: string;
  saveBusyKey?: string;
  deleteBusyKey?: string;
  onChange: (draft: UserConfig) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  if (!state) {
    return null;
  }
  const { username, draft } = state;
  const update = (value: Partial<UserConfig>) => onChange({ ...draft, ...value });
  const updateList = (field: UserConfigListKey, value: string) =>
    update({ [field]: splitLines(value) });
  const updateString = (field: UserConfigStringKey, value: string) =>
    update({ [field]: value } as Partial<UserConfig>);
  const updateNumber = (field: UserConfigNumberKey, value: string) =>
    update({ [field]: nullableNumber(value) } as Partial<UserConfig>);
  const updateBoolean = (field: UserConfigBoolKey, value: string) =>
    update({ [field]: nullableBoolean(value) } as Partial<UserConfig>);
  const saving = busy === (saveBusyKey ?? `user-config-save-${username}`);
  const deleting = busy === (deleteBusyKey ?? `user-config-delete-${username}`);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel user-config-dialog" role="dialog" aria-modal="true">
        <div className="panel-header">
          <h2>{title ?? `${username} config`}</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <form
          className="user-config-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <section>
            <h3>Addressing</h3>
            <div className="settings-grid">
              <TextField label="Explicit IPv4" value={draft.explicit_ipv4} onChange={(value) => updateString("explicit_ipv4", value)} />
              <TextField label="Explicit IPv6" value={draft.explicit_ipv6} onChange={(value) => updateString("explicit_ipv6", value)} />
              <TextField label="IPv4 network" value={draft.ipv4_network} onChange={(value) => updateString("ipv4_network", value)} />
              <TextField label="IPv4 netmask" value={draft.ipv4_netmask} onChange={(value) => updateString("ipv4_netmask", value)} />
              <TextField label="IPv6 network" value={draft.ipv6_network} onChange={(value) => updateString("ipv6_network", value)} />
              <NumberField label="IPv6 prefix" value={draft.ipv6_subnet_prefix} min={1} max={128} onChange={(value) => updateNumber("ipv6_subnet_prefix", value)} />
              <TextField label="Hostname" value={draft.hostname} onChange={(value) => updateString("hostname", value)} />
            </div>
          </section>

          <section>
            <h3>
              DNS and routes
              <KorclientHint text="Routes and Split DNS below reach any client over the standard AnyConnect handshake, and are also synced live to connected korclient clients via GET /api/client/routing (polled every sync.interval_seconds) — changes apply without reconnecting." />
            </h3>
            <div className="settings-grid">
              <ListField label="DNS" value={draft.dns} onChange={(value) => updateList("dns", value)} />
              <ListField label="NBNS" value={draft.nbns} onChange={(value) => updateList("nbns", value)} />
              <ListField
                label="Split DNS"
                value={draft.split_dns}
                korclientHint="korclient resolves these through its own dnsmasq and routes the results through the tunnel automatically. A stock OpenConnect client only gets DNS-suffix scoping, with no real traffic routing."
                onChange={(value) => updateList("split_dns", value)}
              />
              <ListField
                label="Routes"
                value={draft.routes}
                korclientHint="korclient applies this as an nftables policy-route (kept out of the OS routing table). A stock OpenConnect client gets it as a plain pushed route instead."
                onChange={(value) => updateList("routes", value)}
              />
              <ListField label="No routes" value={draft.no_routes} onChange={(value) => updateList("no_routes", value)} />
              <ListField label="IRoutes" value={draft.iroutes} onChange={(value) => updateList("iroutes", value)} />
            </div>
          </section>

          <section>
            <h3>Limits</h3>
            <div className="settings-grid">
              <NumberField label="RX bytes/s" value={draft.rx_data_per_sec} min={0} onChange={(value) => updateNumber("rx_data_per_sec", value)} />
              <NumberField label="TX bytes/s" value={draft.tx_data_per_sec} min={0} onChange={(value) => updateNumber("tx_data_per_sec", value)} />
              <TextField label="Net priority" value={draft.net_priority} onChange={(value) => updateString("net_priority", value)} />
              <NumberField label="MTU" value={draft.mtu} min={576} max={65535} onChange={(value) => updateNumber("mtu", value)} />
              <NumberField label="Max same clients" value={draft.max_same_clients} min={1} onChange={(value) => updateNumber("max_same_clients", value)} />
              <NumberField label="Stats report time" value={draft.stats_report_time} min={0} onChange={(value) => updateNumber("stats_report_time", value)} />
            </div>
          </section>

          <section>
            <h3>Timeouts</h3>
            <div className="settings-grid">
              <NumberField label="Keepalive" value={draft.keepalive} min={0} onChange={(value) => updateNumber("keepalive", value)} />
              <NumberField label="DPD" value={draft.dpd} min={0} onChange={(value) => updateNumber("dpd", value)} />
              <NumberField label="Mobile DPD" value={draft.mobile_dpd} min={0} onChange={(value) => updateNumber("mobile_dpd", value)} />
              <NumberField label="Session timeout" value={draft.session_timeout} min={1} onChange={(value) => updateNumber("session_timeout", value)} />
              <NumberField label="Idle timeout" value={draft.idle_timeout} min={1} onChange={(value) => updateNumber("idle_timeout", value)} />
              <NumberField label="Mobile idle timeout" value={draft.mobile_idle_timeout} min={1} onChange={(value) => updateNumber("mobile_idle_timeout", value)} />
            </div>
          </section>

          <section>
            <h3>Policy</h3>
            <div className="settings-grid">
              <BooleanField label="Deny roaming" value={draft.deny_roaming} onChange={(value) => updateBoolean("deny_roaming", value)} />
              <BooleanField label="No UDP" value={draft.no_udp} onChange={(value) => updateBoolean("no_udp", value)} />
              <BooleanField label="Tunnel all DNS" value={draft.tunnel_all_dns} onChange={(value) => updateBoolean("tunnel_all_dns", value)} />
              <BooleanField label="Restrict to routes" value={draft.restrict_user_to_routes} onChange={(value) => updateBoolean("restrict_user_to_routes", value)} />
              <TextField label="Restrict to ports" value={draft.restrict_user_to_ports} onChange={(value) => updateString("restrict_user_to_ports", value)} />
            </div>
          </section>

          <div className="modal-actions">
            <ActionButton
              label="Clear"
              icon={Trash2}
              danger
              busy={deleting}
              onClick={onDelete}
            />
            <button className="primary-button" disabled={saving} type="submit">
              <Save size={18} aria-hidden="true" />
              <span>{saving ? "Working" : "Save"}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        max={max}
        min={min}
        type="number"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ListField({
  label,
  value,
  onChange,
  hint,
  korclientHint
}: {
  label: string;
  value: string[];
  onChange: (value: string) => void;
  hint?: string;
  korclientHint?: string;
}) {
  // Keep the raw text locally so typing spaces/newlines is not eaten by the
  // parent's parse-on-change normalization; the parent still receives every
  // keystroke and stores the parsed list.
  const [text, setText] = useState(() => listText(value));
  useEffect(() => {
    setText((current) =>
      splitLines(current).join("\n") === value.join("\n") ? current : listText(value)
    );
  }, [value]);
  return (
    <label>
      <span>
        {label}
        {korclientHint && <KorclientHint text={korclientHint} />}
      </span>
      <textarea
        rows={3}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(event.target.value);
        }}
      />
      {hint && <small className="muted-line">{hint}</small>}
    </label>
  );
}

function BooleanField({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean | null;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value)}>
        <option value="">Inherit</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    </label>
  );
}

function SessionsView({
  sessions,
  sessionRates,
  busy,
  commandOutput,
  onClearCommand,
  onKick
}: {
  sessions: SessionRecord[];
  sessionRates: SessionRates;
  busy: string | null;
  commandOutput: CommandResult | CommandResult[] | null;
  onClearCommand: () => void;
  onKick: (username: string) => void;
}) {
  return (
    <div className="view-stack">
      <section className="panel">
        <Table
          columns={[
            "Username",
            "Internal IP",
            "External IP",
            "Device",
            "Duration",
            "Download",
            "Upload",
            "Actions"
          ]}
          empty="No sessions"
        >
          {sessions.map((session) => {
            const key = sessionKey(session);
            const rates = sessionRates[key];
            return (
              <tr key={key}>
                <td>{session.username || "-"}</td>
                <td>{session.vpn_ip ?? "-"}</td>
                <td>{session.real_ip ?? "-"}</td>
                <td>{session.device ?? "-"}</td>
                <td>{formatDuration(session.duration_seconds)}</td>
                <td>
                  <TrafficValue rate={rates?.download ?? null} value={session.tx} />
                </td>
                <td>
                  <TrafficValue rate={rates?.upload ?? null} value={session.rx} />
                </td>
                <td>
                  <IconButton
                    label="Kick session"
                    icon={Ban}
                    danger
                    busy={busy === `kick-${session.username}`}
                    onClick={() => onKick(session.username)}
                  />
                </td>
              </tr>
            );
          })}
        </Table>
      </section>
      {commandOutput && (
        <LastCommandPanel title="Last session command" result={commandOutput} onClose={onClearCommand} />
      )}
    </div>
  );
}

function RoutingView({
  routes,
  domains,
  routingDraft,
  busy,
  commandOutput,
  onClearCommand,
  onRoutingDraftChange,
  onSaveRoutingSettings,
  onSaveRoutes,
  onSaveDomains,
  onReloadRouting,
  onApplyNft,
  onCleanupNft,
  onShowNft
}: {
  routes: string[];
  domains: string[];
  routingDraft: {
    mode: string;
    tunnelDns: boolean;
    hostTraffic: boolean;
    dnsmasqListen: string;
    dnsmasqPort: number;
    mainInterface: string;
    fwmark: string;
    tableId: number;
    nftPrefix: string;
  };
  busy: string | null;
  commandOutput: CommandResult | CommandResult[] | null;
  onClearCommand: () => void;
  onRoutingDraftChange: (value: {
    mode: string;
    tunnelDns: boolean;
    hostTraffic: boolean;
    dnsmasqListen: string;
    dnsmasqPort: number;
    mainInterface: string;
    fwmark: string;
    tableId: number;
    nftPrefix: string;
  }) => void;
  onSaveRoutingSettings: () => void;
  onSaveRoutes: (items: string[]) => void;
  onSaveDomains: (items: string[]) => void;
  onReloadRouting: () => void;
  onApplyNft: () => void;
  onCleanupNft: () => void;
  onShowNft: () => void;
}) {
  // "Split routing" as a whole (interface/fwmark/table id/nftables prefix
  // only mean anything once the server actually manages NAT/routing for
  // the VPN subnet, i.e. any mode other than "direct").
  const routingActive = routingDraft.mode !== "direct";
  const splitEnabled = routingDraft.mode === "split";
  // Domains only work if this server's own dnsmasq is the one resolving
  // them (so it can tag the result into the split set) -- without that,
  // the Domains list has no effect at all.
  const splitDnsEnabled = splitEnabled && routingDraft.tunnelDns;
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Server-side routing</h2>
        </div>
        <p className="muted-line">
          Decides how the server itself sends VPN client traffic onward, once it leaves
          ocserv: Off leaves it to the host's normal routing. Full sends all of it through
          the active Upstream connection above, and blocks it while Upstream is down
          instead of leaking it out the host's own connection. Split forces only the
          routes/domains below through Upstream (same kill-switch); everything else
          still uses the host normally.
        </p>
        <div className="settings-grid">
          <label>
            <span>Mode</span>
            <select
              value={routingDraft.mode}
              onChange={(event) =>
                onRoutingDraftChange({ ...routingDraft, mode: event.target.value })
              }
            >
              <option value="direct">Off (host decides)</option>
              <option value="full">Full (all traffic via Upstream)</option>
              <option value="split">Split (only listed traffic via Upstream)</option>
            </select>
          </label>
          <label
            className="switch routing-split-dns"
            title="Push this server's dnsmasq as the DNS for VPN clients and resolve the Domains list below into the split set. Distinct from the per-user/group 'Split DNS' setting. The dnsmasq listen address/port are configured in Config → Internal DNS."
          >
            <input
              checked={routingDraft.tunnelDns}
              disabled={!splitEnabled}
              onChange={(event) =>
                onRoutingDraftChange({ ...routingDraft, tunnelDns: event.target.checked })
              }
              type="checkbox"
            />
            <span>Domain split (DNS)</span>
          </label>
          <label
            className="switch routing-split-dns"
            title="Also route this server host's own traffic by the split routes/domains (marked in the nftables output hook), so the host reaches the same networks as VPN clients without connecting to its own ocserv. Point the host's resolver at the dnsmasq listen address for domain masks to apply. Requires the container to run with network_mode: host — in the default bridge network the rules only exist inside the container's own namespace."
          >
            <input
              checked={routingDraft.hostTraffic}
              disabled={!splitEnabled}
              onChange={(event) =>
                onRoutingDraftChange({ ...routingDraft, hostTraffic: event.target.checked })
              }
              type="checkbox"
            />
            <span>Host traffic</span>
          </label>
          <label>
            <span>Main interface</span>
            <input
              disabled={!routingActive}
              value={routingDraft.mainInterface}
              onChange={(event) =>
                onRoutingDraftChange({ ...routingDraft, mainInterface: event.target.value })
              }
              placeholder="auto"
            />
          </label>
          <label>
            <span>fwmark</span>
            <input
              disabled={!routingActive}
              value={routingDraft.fwmark}
              onChange={(event) =>
                onRoutingDraftChange({ ...routingDraft, fwmark: event.target.value })
              }
            />
          </label>
          <label>
            <span>Routing table id</span>
            <input
              disabled={!routingActive}
              type="number"
              value={routingDraft.tableId}
              onChange={(event) =>
                onRoutingDraftChange({
                  ...routingDraft,
                  tableId: Math.max(1, Number(event.target.value) || 1201)
                })
              }
            />
          </label>
          <label>
            <span>nftables prefix</span>
            <input
              disabled={!routingActive}
              value={routingDraft.nftPrefix}
              onChange={(event) =>
                onRoutingDraftChange({ ...routingDraft, nftPrefix: event.target.value })
              }
            />
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "routing-settings"}
            onClick={onSaveRoutingSettings}
          />
        </div>
      </section>
      <section className="split">
        <BulkListEditor
          title="Routes"
          items={routes}
          placeholder={"10.20.0.0/16\n203.0.113.5"}
          busy={busy === "save-routes"}
          disabled={!splitEnabled}
          onSave={onSaveRoutes}
        />
        <BulkListEditor
          title="Domains"
          items={domains}
          placeholder={"internal.example\ncorp.example.com"}
          busy={busy === "save-domains"}
          disabled={!splitDnsEnabled}
          onSave={onSaveDomains}
        />
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>nftables</h2>
        </div>
        {commandOutput ? (
          <CommandBlock result={commandOutput} onClose={onClearCommand} />
        ) : (
          <EmptyState text="No command output" />
        )}
        <div className="panel-footer">
          <ActionButton
            label="Show"
            icon={Terminal}
            busy={busy === "show-nft"}
            onClick={onShowNft}
          />
          <ActionButton
            label="Reload"
            icon={RefreshCw}
            busy={busy === "reload-routing"}
            onClick={onReloadRouting}
          />
          <ActionButton
            label="Cleanup"
            icon={Trash2}
            danger
            busy={busy === "cleanup-nft"}
            onClick={onCleanupNft}
          />
          <ActionButton
            label="Apply"
            icon={Play}
            primary
            busy={busy === "apply-nft"}
            onClick={onApplyNft}
          />
        </div>
      </section>
    </div>
  );
}

function InternalDnsView({
  status,
  draft,
  dnsServerDraft,
  busy,
  commandOutput,
  onClearCommand,
  onDraftChange,
  onDnsServerDraftChange,
  onSave,
  onSaveDnsServer,
  onPreviewUrl,
  onRefreshUrl
}: {
  status: InternalDnsStatus | null;
  draft: {
    enabled: boolean;
    domainsText: string;
    filesText: string;
    urlsText: string;
    cacheSize: number;
    logQueries: boolean;
    localRecordsText: string;
  };
  dnsServerDraft: {
    mode: string;
    tunnelDns: boolean;
    hostTraffic: boolean;
    dnsmasqListen: string;
    dnsmasqPort: number;
    mainInterface: string;
    fwmark: string;
    tableId: number;
    nftPrefix: string;
  };
  busy: string | null;
  commandOutput: CommandResult | CommandResult[] | null;
  onClearCommand: () => void;
  onDraftChange: (value: {
    enabled: boolean;
    domainsText: string;
    filesText: string;
    urlsText: string;
    cacheSize: number;
    logQueries: boolean;
    localRecordsText: string;
  }) => void;
  onDnsServerDraftChange: (value: {
    mode: string;
    tunnelDns: boolean;
    hostTraffic: boolean;
    dnsmasqListen: string;
    dnsmasqPort: number;
    mainInterface: string;
    fwmark: string;
    tableId: number;
    nftPrefix: string;
  }) => void;
  onSave: () => void;
  onSaveDnsServer: () => void;
  onPreviewUrl: (url: string) => void;
  onRefreshUrl: (url: string) => void;
}) {
  // The dnsmasq listen address/port matter whenever this server's own
  // dnsmasq actually runs -- Internal DNS OR split-mode domain resolution
  // (see AppConfig.dns_tunnel_active on the backend), not Internal DNS alone.
  const dnsmasqActive =
    draft.enabled || (dnsServerDraft.mode === "split" && dnsServerDraft.tunnelDns);
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Internal DNS</h2>
        </div>
        <p className="muted-line">
          When Internal DNS is enabled, the VPN server itself becomes the DNS server for all
          clients: ocserv pushes{" "}
          {status ? `${status.listen}:${status.port}` : "the dnsmasq listen address"} instead of
          the upstream DNS list, and the built-in dnsmasq forwards queries to the DNS servers
          configured in Config → Server while blocking the domains listed below (Pi-hole style).
        </p>
        <div className="settings-grid">
          <label className="switch" title="Run the built-in DNS server and push it to clients">
            <input
              checked={draft.enabled}
              onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
              type="checkbox"
            />
            <span>Enable Internal DNS</span>
          </label>
          {status && (
            <label>
              <span>DNS pushed to clients</span>
              <input readOnly value={status.client_dns.join(", ")} />
            </label>
          )}
          <label title="Number of DNS answers dnsmasq keeps cached (dnsmasq --cache-size)">
            <span>Cache size</span>
            <input
              type="number"
              min={0}
              max={10000}
              value={draft.cacheSize}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  cacheSize: Math.max(0, Number(event.target.value) || 0)
                })
              }
            />
          </label>
          <label
            className="switch"
            title="Log every DNS query dnsmasq handles, to dnsmasq.log (Logs tab) -- useful for troubleshooting, noisy in normal operation"
          >
            <input
              checked={draft.logQueries}
              onChange={(event) => onDraftChange({ ...draft, logQueries: event.target.checked })}
              type="checkbox"
            />
            <span>Log queries</span>
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "internal-dns-settings"}
            onClick={onSave}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>DNS server</h2>
        </div>
        <p className="muted-line">
          Where this server's built-in dnsmasq actually listens -- must be an address inside the
          VPN client subnet (Config → Server) so clients can reach it. Shared by Internal DNS and
          by Upstream's split-mode "Domain split (DNS)" routing; either one keeps it active.
        </p>
        <div className="settings-grid">
          <label>
            <span>dnsmasq listen</span>
            <input
              disabled={!dnsmasqActive}
              value={dnsServerDraft.dnsmasqListen}
              onChange={(event) =>
                onDnsServerDraftChange({ ...dnsServerDraft, dnsmasqListen: event.target.value })
              }
            />
          </label>
          <label>
            <span>dnsmasq port</span>
            <input
              disabled={!dnsmasqActive}
              min={1}
              max={65535}
              type="number"
              value={dnsServerDraft.dnsmasqPort}
              onChange={(event) =>
                onDnsServerDraftChange({
                  ...dnsServerDraft,
                  dnsmasqPort: Math.max(1, Number(event.target.value) || 53)
                })
              }
            />
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "routing-settings"}
            onClick={onSaveDnsServer}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Local DNS records</h2>
        </div>
        <p className="muted-line">
          Static hostname → IP overrides answered directly by this server's dnsmasq -- handy for
          naming internal resources reachable through Upstream/split routing without running a
          full DNS zone. One per line: <code>hostname ip</code>.
        </p>
        <div className="settings-grid internal-dns-grid">
          <label className="blocklist-domains">
            <span>Records</span>
            <textarea
              rows={6}
              placeholder={"nas.corp.local 10.11.11.5\nprinter.corp.local 10.11.11.6"}
              value={draft.localRecordsText}
              onChange={(event) =>
                onDraftChange({ ...draft, localRecordsText: event.target.value })
              }
            />
          </label>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Blocklist</h2>
          {status && <Pill kind="muted">{status.total} domains blocked in total</Pill>}
        </div>
        <div className="settings-grid internal-dns-grid">
          <label className="blocklist-domains">
            <span>Blocked domains (one per line)</span>
            <textarea
              rows={8}
              placeholder={"ads.example.com\ntracker.example.net"}
              value={draft.domainsText}
              onChange={(event) => onDraftChange({ ...draft, domainsText: event.target.value })}
            />
          </label>
          <label className="blocklist-domains">
            <span>Blocklist files (one path per line)</span>
            <textarea
              rows={4}
              placeholder={"/var/lib/korserver/blocklist.txt\n/var/lib/korserver/blocklist2.txt"}
              value={draft.filesText}
              onChange={(event) => onDraftChange({ ...draft, filesText: event.target.value })}
            />
          </label>
          <label className="blocklist-domains">
            <span>Blocklist URLs (one per line)</span>
            <textarea
              rows={4}
              placeholder={
                "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts\n" +
                "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/multi-onlydomains.txt"
              }
              value={draft.urlsText}
              onChange={(event) => onDraftChange({ ...draft, urlsText: event.target.value })}
            />
          </label>
        </div>
        <p className="muted-line">
          Save the settings first, then validate a saved URL below to preview the downloaded list
          before applying it. Hosts files, plain domain lists and AdBlock-style entries are
          accepted; anything else is skipped. Downloads are size-limited and parsed safely.
        </p>
        {status && status.blocklist_files.length > 0 && (
          <ul className="blocklist-file-status">
            {status.blocklist_files.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                <span className="muted-line">
                  {file.exists ? ` — ${file.count} domains` : " — file not found"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {status && status.blocklist_urls.length > 0 && (
          <ul className="blocklist-url-status">
            {status.blocklist_urls.map((entry) => {
              const lastRefresh = entry.meta?.fetched_at
                ? new Date(entry.meta.fetched_at * 1000).toLocaleString()
                : null;
              return (
                <li key={entry.url} className="blocklist-url-entry">
                  <code>{entry.url}</code>
                  <span className="muted-line">
                    {entry.count} domains cached
                    {lastRefresh ? ` — last download: ${lastRefresh}` : ""}
                  </span>
                  <div className="toolbar blocklist-url-actions">
                    <ActionButton
                      label="Validate URL"
                      icon={Eye}
                      busy={busy === `internal-dns-preview-${entry.url}`}
                      onClick={() => onPreviewUrl(entry.url)}
                    />
                    <ActionButton
                      label="Download & apply"
                      icon={Download}
                      busy={busy === `internal-dns-refresh-${entry.url}`}
                      onClick={() => onRefreshUrl(entry.url)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {commandOutput ? (
          <CommandBlock result={commandOutput} onClose={onClearCommand} />
        ) : (
          <EmptyState text="No command output" />
        )}
      </section>
    </div>
  );
}

function IdentityView({
  identity,
  oidcDraft,
  providerDraft,
  groupDraft,
  identitySettingsDraft,
  busy,
  commandOutput,
  onClearCommand,
  onOidcDraftChange,
  onProviderDraftChange,
  onGroupDraftChange,
  onIdentitySettingsDraftChange,
  onSaveIdentitySettings,
  onSaveOidcSettings,
  onSaveProvider,
  onSaveGroup,
  onDeleteProvider,
  onDeleteGroup
}: {
  identity: IdentityStatus | null;
  oidcDraft: OidcDraft;
  providerDraft: OidcProviderDraft;
  groupDraft: GroupPolicyDraft;
  identitySettingsDraft: {
    selectGroupByUrl: boolean;
    defaultSelectGroup: string;
    defaultGroupConfig: string;
  };
  busy: string | null;
  commandOutput: CommandOutput;
  onClearCommand: () => void;
  onOidcDraftChange: (value: OidcDraft) => void;
  onProviderDraftChange: (value: OidcProviderDraft) => void;
  onGroupDraftChange: (value: GroupPolicyDraft) => void;
  onIdentitySettingsDraftChange: (value: {
    selectGroupByUrl: boolean;
    defaultSelectGroup: string;
    defaultGroupConfig: string;
  }) => void;
  onSaveIdentitySettings: () => void;
  onSaveOidcSettings: () => void;
  onSaveProvider: (event: FormEvent<HTMLFormElement>) => void;
  onSaveGroup: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteProvider: (name: string) => void;
  onDeleteGroup: (name: string) => void;
}) {
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Group routing</h2>
          <div className="toolbar">
            <Pill kind={identity?.auth.enabled ? "ok" : "muted"}>
              {identity?.auth.enabled ? `OIDC via ${identity.auth.connector}` : "OIDC disabled"}
            </Pill>
            <Pill kind="muted">
              {identity?.oidc_providers.length ?? 0} provider
              {identity?.oidc_providers.length === 1 ? "" : "s"}
            </Pill>
            <Pill kind="muted">
              {identity?.group_policies.length ?? 0} group
              {identity?.group_policies.length === 1 ? "" : "s"}
            </Pill>
          </div>
        </div>
        <div className="settings-grid">
          <label className="switch" title="Select a group policy from the connection URL path">
            <input
              checked={identitySettingsDraft.selectGroupByUrl}
              onChange={(event) =>
                onIdentitySettingsDraftChange({
                  ...identitySettingsDraft,
                  selectGroupByUrl: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Select group by URL</span>
          </label>
          <label>
            <span>Default select group</span>
            <input
              value={identitySettingsDraft.defaultSelectGroup}
              onChange={(event) =>
                onIdentitySettingsDraftChange({
                  ...identitySettingsDraft,
                  defaultSelectGroup: event.target.value
                })
              }
            />
          </label>
          <label>
            <span>Default group config</span>
            <input
              value={identitySettingsDraft.defaultGroupConfig}
              onChange={(event) =>
                onIdentitySettingsDraftChange({
                  ...identitySettingsDraft,
                  defaultGroupConfig: event.target.value
                })
              }
              placeholder="/var/lib/korserver/generated/config-per-group/default"
            />
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "identity-settings"}
            onClick={onSaveIdentitySettings}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>OIDC connector</h2>
        </div>
        <div className="settings-grid">
          <button
            className={`toggle-action${oidcDraft.enabled ? " active" : ""}`}
            onClick={() => onOidcDraftChange({ ...oidcDraft, enabled: !oidcDraft.enabled })}
            title="Enable external identity authentication for VPN clients"
            type="button"
          >
            <Power size={17} aria-hidden="true" />
            <span>{oidcDraft.enabled ? "Disable OIDC" : "Enable OIDC"}</span>
          </button>
          <label>
            <span>Mode</span>
            <select
              value={oidcDraft.connector}
              onChange={(event) =>
                onOidcDraftChange({
                  ...oidcDraft,
                  connector: event.target.value as typeof oidcDraft.connector
                })
              }
            >
              <option value="pam">PAM bridge</option>
              <option value="radius">RADIUS bridge</option>
            </select>
          </label>
          <label>
            <span>PAM service</span>
            <input
              value={oidcDraft.pamService}
              onChange={(event) => onOidcDraftChange({ ...oidcDraft, pamService: event.target.value })}
            />
          </label>
          <label>
            <span>PAM gid min</span>
            <input
              value={oidcDraft.pamGidMin}
              onChange={(event) => onOidcDraftChange({ ...oidcDraft, pamGidMin: event.target.value })}
            />
          </label>
          <label>
            <span>RADIUS config</span>
            <input
              value={oidcDraft.radiusConfigFile}
              onChange={(event) =>
                onOidcDraftChange({ ...oidcDraft, radiusConfigFile: event.target.value })
              }
            />
          </label>
          <label>
            <span>NAS id</span>
            <input
              value={oidcDraft.radiusNasIdentifier}
              onChange={(event) =>
                onOidcDraftChange({ ...oidcDraft, radiusNasIdentifier: event.target.value })
              }
            />
          </label>
          <label>
            <span>Group separator</span>
            <select
              value={oidcDraft.radiusGroupSeparator}
              onChange={(event) =>
                onOidcDraftChange({
                  ...oidcDraft,
                  radiusGroupSeparator: event.target.value as typeof oidcDraft.radiusGroupSeparator
                })
              }
            >
              <option value="semicolon">Semicolon</option>
              <option value="comma">Comma</option>
            </select>
          </label>
          <label className="switch" title="Pass RADIUS group attributes to ocserv as groupconfig">
            <input
              checked={oidcDraft.radiusGroupconfig}
              onChange={(event) =>
                onOidcDraftChange({ ...oidcDraft, radiusGroupconfig: event.target.checked })
              }
              type="checkbox"
            />
            <span>RADIUS groupconfig</span>
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "oidc-settings"}
            onClick={onSaveOidcSettings}
          />
        </div>
      </section>

      <section className="split">
        <section className="panel">
          <div className="panel-header">
            <h2>OIDC provider</h2>
          </div>
          <form onSubmit={onSaveProvider}>
          <div className="settings-grid">
            <label>
              <span>Name</span>
              <input
                value={providerDraft.name}
                onChange={(event) => onProviderDraftChange({ ...providerDraft, name: event.target.value })}
                required
              />
            </label>
            <label>
              <span>Issuer URL</span>
              <input
                value={providerDraft.issuer_url}
                onChange={(event) =>
                  onProviderDraftChange({ ...providerDraft, issuer_url: event.target.value })
                }
                placeholder="https://sso.example.com/realms/vpn"
                required
              />
            </label>
            <label>
              <span>Client ID</span>
              <input
                value={providerDraft.client_id}
                onChange={(event) =>
                  onProviderDraftChange({ ...providerDraft, client_id: event.target.value })
                }
                required
              />
            </label>
            <label>
              <span>Client secret</span>
              <input
                type="password"
                value={providerDraft.client_secret}
                onChange={(event) =>
                  onProviderDraftChange({ ...providerDraft, client_secret: event.target.value })
                }
              />
            </label>
            <label>
              <span>Scopes</span>
              <input
                value={providerDraft.scopes.join(" ")}
                onChange={(event) =>
                  onProviderDraftChange({
                    ...providerDraft,
                    scopes: event.target.value.split(/\s+/).filter(Boolean)
                  })
                }
              />
            </label>
            <label>
              <span>Username claim</span>
              <input
                value={providerDraft.username_claim}
                onChange={(event) =>
                  onProviderDraftChange({ ...providerDraft, username_claim: event.target.value })
                }
              />
            </label>
            <label>
              <span>Groups claim</span>
              <input
                value={providerDraft.groups_claim}
                onChange={(event) =>
                  onProviderDraftChange({ ...providerDraft, groups_claim: event.target.value })
                }
              />
            </label>
            <label>
              <span>Allowed groups</span>
              <input
                value={providerDraft.allowed_groups.join(", ")}
                onChange={(event) =>
                  onProviderDraftChange({
                    ...providerDraft,
                    allowed_groups: splitLines(event.target.value)
                  })
                }
              />
            </label>
          </div>
            <div className="panel-footer">
              <button className="primary-button" disabled={busy === "oidc-provider"} type="submit">
                <Save size={18} aria-hidden="true" />
                <span>Save provider</span>
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>
              Group policy
              <KorclientHint text="Routes and Split DNS below reach any client over the standard AnyConnect handshake, and are also synced live to connected korclient clients via GET /api/client/routing (polled every sync.interval_seconds) — changes apply without reconnecting." />
            </h2>
          </div>
          <form onSubmit={onSaveGroup}>
          <div className="settings-grid">
            <label>
              <span>Name</span>
              <input
                value={groupDraft.name}
                onChange={(event) => onGroupDraftChange({ ...groupDraft, name: event.target.value })}
                required
              />
            </label>
            <label>
              <span>Display name</span>
              <input
                value={groupDraft.display_name}
                onChange={(event) =>
                  onGroupDraftChange({ ...groupDraft, display_name: event.target.value })
                }
              />
            </label>
            <label>
              <span>
                Routes
                <KorclientHint text="korclient applies this as an nftables policy-route (kept out of the OS routing table). A stock OpenConnect client gets it as a plain pushed route instead." />
              </span>
              <textarea
                value={groupDraft.routes}
                onChange={(event) => onGroupDraftChange({ ...groupDraft, routes: event.target.value })}
                rows={3}
              />
            </label>
            <label>
              <span>No routes</span>
              <textarea
                value={groupDraft.no_routes}
                onChange={(event) =>
                  onGroupDraftChange({ ...groupDraft, no_routes: event.target.value })
                }
                rows={3}
              />
            </label>
            <label>
              <span>DNS</span>
              <textarea
                value={groupDraft.dns}
                onChange={(event) => onGroupDraftChange({ ...groupDraft, dns: event.target.value })}
                rows={2}
              />
            </label>
            <label>
              <span>
                Split DNS
                <KorclientHint text="korclient resolves these through its own dnsmasq and routes the results through the tunnel automatically. A stock OpenConnect client only gets DNS-suffix scoping, with no real traffic routing." />
              </span>
              <textarea
                value={groupDraft.split_dns}
                onChange={(event) =>
                  onGroupDraftChange({ ...groupDraft, split_dns: event.target.value })
                }
                rows={2}
              />
            </label>
            <label>
              <span>Max same clients</span>
              <input
                value={groupDraft.max_same_clients}
                onChange={(event) =>
                  onGroupDraftChange({ ...groupDraft, max_same_clients: event.target.value })
                }
              />
            </label>
            <label>
              <span>Session timeout</span>
              <input
                value={groupDraft.session_timeout}
                onChange={(event) =>
                  onGroupDraftChange({ ...groupDraft, session_timeout: event.target.value })
                }
              />
            </label>
            <label>
              <span>Idle timeout</span>
              <input
                value={groupDraft.idle_timeout}
                onChange={(event) =>
                  onGroupDraftChange({ ...groupDraft, idle_timeout: event.target.value })
                }
              />
            </label>
            <label className="switch" title="Route all DNS traffic through the tunnel for this group">
              <input
                checked={groupDraft.tunnel_all_dns}
                onChange={(event) =>
                  onGroupDraftChange({ ...groupDraft, tunnel_all_dns: event.target.checked })
                }
                type="checkbox"
              />
              <span>Tunnel all DNS</span>
            </label>
            <label className="switch" title="Disable UDP/DTLS for clients in this group">
              <input
                checked={groupDraft.no_udp}
                onChange={(event) => onGroupDraftChange({ ...groupDraft, no_udp: event.target.checked })}
                type="checkbox"
              />
              <span>No UDP</span>
            </label>
          </div>
            <div className="panel-footer">
              <button className="primary-button" disabled={busy === "group-policy"} type="submit">
                <Save size={18} aria-hidden="true" />
                <span>Save group</span>
              </button>
            </div>
          </form>
        </section>
      </section>

      <section className="split">
        <section className="panel">
          <Table columns={["Provider", "Issuer", "Client", "Groups", "Actions"]} empty="No providers">
            {(identity?.oidc_providers ?? []).map((provider) => (
              <tr key={provider.name}>
                <td>{provider.name}</td>
                <td>{provider.issuer_url}</td>
                <td>{provider.client_id}</td>
                <td>{provider.allowed_groups.join(", ")}</td>
                <td>
                  <IconButton
                    label="Delete provider"
                    icon={Trash2}
                    danger
                    busy={busy === `oidc-provider-delete-${provider.name}`}
                    onClick={() => onDeleteProvider(provider.name)}
                  />
                </td>
              </tr>
            ))}
          </Table>
        </section>
        <section className="panel">
          <Table columns={["Group", "Routes", "DNS", "Actions"]} empty="No group policies">
            {(identity?.group_policies ?? []).map((group) => (
              <tr key={group.name}>
                <td>{group.display_name ?? group.name}</td>
                <td>{group.routes.join(", ")}</td>
                <td>{[...group.dns, ...group.split_dns].join(", ")}</td>
                <td>
                  <IconButton
                    label="Delete group"
                    icon={Trash2}
                    danger
                    busy={busy === `group-policy-delete-${group.name}`}
                    onClick={() => onDeleteGroup(group.name)}
                  />
                </td>
              </tr>
            ))}
          </Table>
        </section>
      </section>

      {commandOutput && (
        <LastCommandPanel title="Last identity command" result={commandOutput} onClose={onClearCommand} />
      )}
    </div>
  );
}

function UpstreamView({
  status,
  profiles,
  busy,
  commandOutput,
  onClearCommand,
  onSetEnabled,
  onSetProfileEnabled,
  onSwitch,
  onDeleteProfile,
  onCreateProfile,
  onEditProfile,
  onOpenSettings,
  onConnect,
  onDisconnect,
  onConnectProfile,
  onDisconnectProfile
}: {
  status: UpstreamStatus | null;
  profiles: UpstreamProfile[];
  busy: string | null;
  commandOutput: CommandResult | CommandResult[] | null;
  onClearCommand: () => void;
  onSetEnabled: (enabled: boolean) => void;
  onSetProfileEnabled: (profile: string, enabled: boolean) => void;
  onSwitch: (profile: string) => void;
  onDeleteProfile: (profile: string) => void;
  onCreateProfile: () => void;
  onEditProfile: (profile: UpstreamProfile) => void;
  onOpenSettings: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onConnectProfile: (profile: string) => void;
  onDisconnectProfile: (profile: string) => void;
}) {
  const enabled = Boolean(status?.enabled);
  const connected = Boolean(status?.connected);
  const hasProfile = profiles.length > 0;
  const connectionFor = (name: string) =>
    status?.connections.find((connection) => connection.profile === name);
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Status</h2>
        </div>
        <div className="facts">
          <Fact label="Enabled" value={status?.enabled ? "yes" : "no"} />
          <Fact label="Connected" value={connected ? "yes" : "no"} />
          <Fact label="Active profile" value={status?.active_profile ?? ""} />
          <Fact label="Interface" value={status?.interface ?? ""} />
          {connected && (
            <>
              <Fact label="Local address" value={status?.local_ip ?? ""} />
              <Fact label="Remote" value={status?.remote ?? ""} />
            </>
          )}
        </div>
        <div className="panel-footer">
          <ActionButton label="Settings" icon={Settings} onClick={onOpenSettings} />
          {connected ? (
            <ActionButton
              label="Disconnect"
              icon={Unplug}
              busy={busy === "disconnect-upstream"}
              onClick={onDisconnect}
            />
          ) : (
            <ActionButton
              label="Connect"
              icon={RadioTower}
              disabled={!enabled || !status?.active_profile}
              busy={busy === "connect-upstream"}
              onClick={onConnect}
            />
          )}
          <ActionButton
            label={enabled ? "Disable" : "Enable"}
            icon={Power}
            primary={!enabled}
            danger={enabled}
            disabled={!enabled && !hasProfile}
            busy={busy === "upstream-settings"}
            onClick={() => onSetEnabled(!enabled)}
          />
        </div>
      </section>
      <section className="panel upstream-profiles-panel">
        <div className="panel-header">
          <h2>Profiles</h2>
          <ActionButton label="Create profile" icon={Plus} onClick={onCreateProfile} />
        </div>
        <Table
          columns={["Name", "Server", "Interface", "Connection", "Check host", "Actions"]}
          empty="No profiles"
        >
          {profiles.map((profile) => {
            const connection = connectionFor(profile.name);
            const profileConnected = Boolean(connection?.connected);
            return (
              <tr key={profile.name}>
                <td>{profile.name}</td>
                <td>{`${profile.server}:${profile.port}`}</td>
                <td>{connection?.interface ?? profile.interface ?? ""}</td>
                <td>
                  {!profile.enabled ? (
                    <Pill kind="muted">disabled</Pill>
                  ) : profileConnected ? (
                    <Pill kind="ok">{connection?.local_ip ?? "connected"}</Pill>
                  ) : (
                    <Pill kind="muted">down</Pill>
                  )}
                </td>
                <td>{profile.check_host ?? ""}</td>
                <td>
                  <div className="toolbar">
                    <ActionButton
                      label={status?.active_profile === profile.name ? "Active" : "Switch"}
                      icon={status?.active_profile === profile.name ? CheckCircle2 : RadioTower}
                      disabled={status?.active_profile === profile.name || !profile.enabled}
                      busy={busy === `switch-${profile.name}`}
                      title="Make this profile active: redirection rules re-point to its tunnel, connections stay up"
                      onClick={() => onSwitch(profile.name)}
                    />
                    <IconButton
                      label={
                        profile.enabled
                          ? "Disable profile (stop watchdog, disconnect)"
                          : "Enable profile (let watchdog dial it)"
                      }
                      icon={Power}
                      danger={profile.enabled}
                      busy={busy === `upstream-profile-enabled-${profile.name}`}
                      onClick={() => onSetProfileEnabled(profile.name, !profile.enabled)}
                    />
                    {profileConnected ? (
                      <IconButton
                        label="Disconnect profile"
                        icon={Unplug}
                        busy={busy === `upstream-profile-disconnect-${profile.name}`}
                        onClick={() => onDisconnectProfile(profile.name)}
                      />
                    ) : (
                      <IconButton
                        label="Connect profile"
                        icon={RadioTower}
                        busy={busy === `upstream-profile-connect-${profile.name}`}
                        onClick={() => onConnectProfile(profile.name)}
                      />
                    )}
                    <IconButton
                      label="Edit profile"
                      icon={Pencil}
                      onClick={() => onEditProfile(profile)}
                    />
                    <IconButton
                      label="Delete profile"
                      icon={Trash2}
                      danger
                      busy={busy === `upstream-profile-delete-${profile.name}`}
                      onClick={() => onDeleteProfile(profile.name)}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </section>
      {commandOutput && (
        <LastCommandPanel title="Last upstream command" result={commandOutput} onClose={onClearCommand} />
      )}
    </div>
  );
}

function UpstreamSettingsDialog({
  upstreamInterface,
  checkInterval,
  checkThreshold,
  failover,
  checkHost,
  hasActiveProfile,
  busy,
  onInterfaceChange,
  onCheckIntervalChange,
  onCheckThresholdChange,
  onFailoverChange,
  onCheckHostChange,
  onClose,
  onSave
}: {
  upstreamInterface: string;
  checkInterval: number;
  checkThreshold: number;
  failover: boolean;
  checkHost: string;
  hasActiveProfile: boolean;
  busy: string | null;
  onInterfaceChange: (value: string) => void;
  onCheckIntervalChange: (value: number) => void;
  onCheckThresholdChange: (value: number) => void;
  onFailoverChange: (value: boolean) => void;
  onCheckHostChange: (value: string) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel group-dialog" role="dialog" aria-modal="true">
        <div className="panel-header">
          <h2>Upstream settings</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <form className="settings-grid upstream-settings-grid" onSubmit={onSave}>
          <label>
            <span>Interface</span>
            <input value={upstreamInterface} onChange={(event) => onInterfaceChange(event.target.value)} />
          </label>
          <label title="Health-check target for the active profile">
            <span>Check host</span>
            <input
              value={checkHost}
              onChange={(event) => onCheckHostChange(event.target.value)}
              placeholder="1.1.1.1"
              disabled={!hasActiveProfile}
            />
          </label>
          <label>
            <span>Check interval (s)</span>
            <input
              type="number"
              value={checkInterval}
              onChange={(event) => onCheckIntervalChange(Math.max(1, Number(event.target.value) || 5))}
            />
          </label>
          <label>
            <span>Check threshold</span>
            <input
              type="number"
              value={checkThreshold}
              onChange={(event) =>
                onCheckThresholdChange(Math.max(1, Number(event.target.value) || 3))
              }
            />
          </label>
          <label className="switch" title="Fail over to the direct route when upstream checks fail">
            <input
              checked={failover}
              onChange={(event) => onFailoverChange(event.target.checked)}
              type="checkbox"
            />
            <span>Failover</span>
          </label>
          <div className="modal-actions">
            <button className="primary-button" disabled={busy === "upstream-settings"} type="submit">
              <Save size={18} aria-hidden="true" />
              <span>Save settings</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function UpstreamProfileDialog({
  draft,
  isEdit,
  busy,
  onDraftChange,
  onClose,
  onSave
}: {
  draft: UpstreamProfileDraft;
  // Fixed by the caller when the dialog opens (create vs. edit an existing
  // profile) -- must NOT be derived from draft.name here, which changes on
  // every keystroke and would flip a brand-new profile into "edit mode"
  // (disabling the Name field below) after the first character typed.
  isEdit: boolean;
  busy: string | null;
  onDraftChange: (value: UpstreamProfileDraft) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [certMode, setCertMode] = useState<CertSourceMode>(draft.cert_file ? "path" : "base64");
  const [keyMode, setKeyMode] = useState<CertSourceMode>(draft.key_file ? "path" : "base64");
  const [certFileName, setCertFileName] = useState<string | null>(null);
  const [keyFileName, setKeyFileName] = useState<string | null>(null);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true">
        <div className="panel-header">
          <h2>{isEdit ? `${draft.name} profile` : "New upstream profile"}</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <form className="settings-grid" onSubmit={onSave}>
          <label>
            <span>Name</span>
            <input
              disabled={isEdit}
              title={isEdit ? "Delete and recreate the profile to rename it" : undefined}
              value={draft.name}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Server</span>
            <input
              value={draft.server}
              onChange={(event) => onDraftChange({ ...draft, server: event.target.value })}
              placeholder="vpn.example.com"
              required
            />
          </label>
          <label>
            <span>Port</span>
            <input
              value={draft.port}
              onChange={(event) => onDraftChange({ ...draft, port: event.target.value })}
              required
            />
          </label>
          <label title="Tunnel device for this profile's own connection; each profile needs its own so several can stay connected at once. Leave empty for an auto-assigned name.">
            <span>Interface</span>
            <input
              value={draft.interface}
              onChange={(event) => onDraftChange({ ...draft, interface: event.target.value })}
              placeholder="auto"
            />
          </label>
          <label>
            <span>Auth</span>
            <select
              value={draft.auth_type}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  auth_type: event.target.value as UpstreamProfileDraft["auth_type"]
                })
              }
            >
              <option value="password">Password</option>
              <option value="cert">Certificate</option>
              <option value="p12">PKCS#12</option>
            </select>
          </label>
          {draft.auth_type === "password" && (
            <>
              <label>
                <span>Username</span>
                <input
                  value={draft.username}
                  onChange={(event) => onDraftChange({ ...draft, username: event.target.value })}
                  required
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={draft.password}
                  onChange={(event) => onDraftChange({ ...draft, password: event.target.value })}
                  required
                />
              </label>
            </>
          )}
          {draft.auth_type === "cert" && (
            <>
              <CertSourceField
                label="Certificate"
                mode={certMode}
                pathValue={draft.cert_file}
                base64Value={draft.cert_file_base64}
                fileName={certFileName}
                pathPlaceholder="/etc/korserver/upstream/client.crt"
                onModeChange={setCertMode}
                onPathChange={(value) =>
                  onDraftChange({ ...draft, cert_file: value, cert_file_base64: "" })
                }
                onBase64Change={(value) =>
                  onDraftChange({ ...draft, cert_file_base64: value, cert_file: "" })
                }
                onFileSelected={(base64, name) => {
                  setCertFileName(name);
                  onDraftChange({ ...draft, cert_file_base64: base64, cert_file: "" });
                }}
              />
              <CertSourceField
                label="Key"
                mode={keyMode}
                pathValue={draft.key_file}
                base64Value={draft.key_file_base64}
                fileName={keyFileName}
                pathPlaceholder="/etc/korserver/upstream/client.key"
                onModeChange={setKeyMode}
                onPathChange={(value) =>
                  onDraftChange({ ...draft, key_file: value, key_file_base64: "" })
                }
                onBase64Change={(value) =>
                  onDraftChange({ ...draft, key_file_base64: value, key_file: "" })
                }
                onFileSelected={(base64, name) => {
                  setKeyFileName(name);
                  onDraftChange({ ...draft, key_file_base64: base64, key_file: "" });
                }}
              />
              <label>
                <span>Key passphrase</span>
                <input
                  type="password"
                  value={draft.cert_pass}
                  onChange={(event) => onDraftChange({ ...draft, cert_pass: event.target.value })}
                  placeholder="only if the key is encrypted"
                />
              </label>
            </>
          )}
          {draft.auth_type === "p12" && (
            <>
              <CertSourceField
                label="PKCS#12 file"
                mode={certMode}
                pathValue={draft.cert_file}
                base64Value={draft.cert_file_base64}
                fileName={certFileName}
                pathPlaceholder="/etc/korserver/upstream/client.p12"
                onModeChange={setCertMode}
                onPathChange={(value) =>
                  onDraftChange({ ...draft, cert_file: value, cert_file_base64: "" })
                }
                onBase64Change={(value) =>
                  onDraftChange({ ...draft, cert_file_base64: value, cert_file: "" })
                }
                onFileSelected={(base64, name) => {
                  setCertFileName(name);
                  onDraftChange({ ...draft, cert_file_base64: base64, cert_file: "" });
                }}
              />
              <label>
                <span>P12 passphrase</span>
                <input
                  type="password"
                  value={draft.cert_pass}
                  onChange={(event) => onDraftChange({ ...draft, cert_pass: event.target.value })}
                />
              </label>
            </>
          )}
          <label>
            <span>Server cert pin</span>
            <input
              value={draft.server_cert_pin}
              onChange={(event) => onDraftChange({ ...draft, server_cert_pin: event.target.value })}
              placeholder="pin-sha256:..."
            />
          </label>
          <label title="Optional: only if the upstream ocserv server has camouflage enabled">
            <span>Camouflage secret</span>
            <input
              value={draft.camouflage_secret}
              onChange={(event) =>
                onDraftChange({ ...draft, camouflage_secret: event.target.value })
              }
              placeholder={isEdit ? "leave blank to keep existing" : "optional"}
            />
          </label>
          <label className="switch" title="Skip upstream certificate verification">
            <input
              checked={draft.trusted_cert}
              onChange={(event) => onDraftChange({ ...draft, trusted_cert: event.target.checked })}
              type="checkbox"
            />
            <span>No cert check</span>
          </label>
          <label className="switch" title="Enable upstream after saving this profile">
            <input
              checked={draft.enable}
              onChange={(event) => onDraftChange({ ...draft, enable: event.target.checked })}
              type="checkbox"
            />
            <span>Enable after save</span>
          </label>
          <label
            className="switch"
            title="Whether the watchdog keeps this specific profile dialed. Off disconnects it (if it's the active profile, that also clears the active selection) and keeps the watchdog from redialing it -- independent of failover, which only controls automatic switching."
          >
            <input
              checked={draft.enabled}
              onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
              type="checkbox"
            />
            <span>Profile enabled</span>
          </label>
          <div className="modal-actions">
            <button
              className="primary-button"
              disabled={busy === "upstream-profile"}
              type="submit"
            >
              <Save size={18} aria-hidden="true" />
              <span>Save profile</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CertificatesView({
  status,
  externalFiles,
  caFiles,
  caRevokeDraft,
  certificateSettingsDraft,
  letsEncryptDraft,
  busy,
  dryRun,
  commandOutput,
  onClearCommand,
  onExternalFilesChange,
  onCaFilesChange,
  onCaRevokeDraftChange,
  onCertificateSettingsDraftChange,
  onSaveCertificateSettings,
  onLetsEncryptDraftChange,
  onUploadExternal,
  onIssueLetsEncrypt,
  onRenewLetsEncrypt,
  onSaveLetsEncryptSettings,
  onSetLetsEncryptEnabled,
  onRegenerateCa,
  onUploadCa,
  onRevokeCaCert,
  onShowRevokedCerts
}: {
  status: CertificateStatus | null;
  externalFiles: { serverCert: File | null; serverKey: File | null; caCert: File | null };
  caFiles: { caCert: File | null; caKey: File | null };
  caRevokeDraft: { certificateB64: string; certificateFile: File | null };
  certificateSettingsDraft: { mode: "auto" | "external"; caName: string };
  letsEncryptDraft: {
    enabled: boolean;
    email: string;
    domains: string;
    staging: boolean;
    reload: boolean;
    autoRenew: boolean;
    interval: number;
    intervalUnit: IntervalUnit;
    http01Address: string;
    http01Port: number;
  };
  busy: string | null;
  dryRun: boolean;
  commandOutput: CommandOutput;
  onClearCommand: () => void;
  onExternalFilesChange: (value: {
    serverCert: File | null;
    serverKey: File | null;
    caCert: File | null;
  }) => void;
  onCaFilesChange: (value: { caCert: File | null; caKey: File | null }) => void;
  onCaRevokeDraftChange: (value: { certificateB64: string; certificateFile: File | null }) => void;
  onCertificateSettingsDraftChange: (value: { mode: "auto" | "external"; caName: string }) => void;
  onSaveCertificateSettings: () => void;
  onLetsEncryptDraftChange: (value: {
    enabled: boolean;
    email: string;
    domains: string;
    staging: boolean;
    reload: boolean;
    autoRenew: boolean;
    interval: number;
    intervalUnit: IntervalUnit;
    http01Address: string;
    http01Port: number;
  }) => void;
  onUploadExternal: (event: FormEvent<HTMLFormElement>) => void;
  onIssueLetsEncrypt: (event: FormEvent<HTMLFormElement>) => void;
  onRenewLetsEncrypt: () => void;
  onSaveLetsEncryptSettings: () => void;
  onSetLetsEncryptEnabled: (enabled: boolean) => void;
  onRegenerateCa: () => void;
  onUploadCa: () => void;
  onRevokeCaCert: () => void;
  onShowRevokedCerts: () => void;
}) {
  const activeReady = status
    ? status.active.server_cert_exists && status.active.server_key_exists && status.active.ca_cert_exists
    : false;
  const leDomains = splitLines(letsEncryptDraft.domains);
  const leEnabled = Boolean(letsEncryptDraft.enabled);
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Authority certificates</h2>
          <Pill
            kind={
              status?.authority.ca_cert_exists && status.authority.ca_key_exists
                ? "ok"
                : "warning"
            }
          >
            {status?.authority.ca_cert_exists && status.authority.ca_key_exists
              ? "Ready"
              : "Incomplete"}
          </Pill>
        </div>
        {status ? (
          <AuthorityPathsView authority={status.authority} />
        ) : (
          <EmptyState text="No CA status" />
        )}
        <div className="settings-grid">
          <label>
            <span>Mode</span>
            <select
              value={certificateSettingsDraft.mode}
              onChange={(event) =>
                onCertificateSettingsDraftChange({
                  ...certificateSettingsDraft,
                  mode: event.target.value as "auto" | "external"
                })
              }
            >
              <option value="auto">Auto (local CA)</option>
              <option value="external">External</option>
            </select>
          </label>
          <label>
            <span>CA name</span>
            <input
              value={certificateSettingsDraft.caName}
              onChange={(event) =>
                onCertificateSettingsDraftChange({
                  ...certificateSettingsDraft,
                  caName: event.target.value
                })
              }
            />
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Regenerate CA"
            icon={RefreshCw}
            danger
            busy={busy === "ca-regenerate"}
            onClick={onRegenerateCa}
          />
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "certificate-settings"}
            onClick={onSaveCertificateSettings}
          />
        </div>
      </section>

      <div className="split">
        <section className="panel">
          <div className="panel-header">
            <h2>Upload custom CA</h2>
          </div>
          <div className="settings-grid">
            <div className="field-label">
              <span>CA certificate</span>
              <FilePicker
                accept=".pem,.crt"
                file={caFiles.caCert}
                label="Select CA cert"
                title="Upload a PEM CA certificate used to sign user and server certificates"
                onChange={(event) =>
                  onCaFilesChange({ ...caFiles, caCert: event.target.files?.[0] ?? null })
                }
              />
            </div>
            <div className="field-label">
              <span>CA private key</span>
              <FilePicker
                accept=".pem,.key"
                file={caFiles.caKey}
                label="Select CA key"
                title="Upload the PEM private key for the CA certificate"
                onChange={(event) =>
                  onCaFilesChange({ ...caFiles, caKey: event.target.files?.[0] ?? null })
                }
              />
            </div>
          </div>
          <div className="panel-footer">
            <ActionButton
              label="Upload CA"
              icon={Upload}
              primary
              disabled={!caFiles.caCert || !caFiles.caKey}
              busy={busy === "ca-upload"}
              onClick={onUploadCa}
            />
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Revoke user certificate</h2>
          </div>
          <div className="settings-grid">
            <label>
              <span>Certificate (PEM)</span>
              <textarea
                rows={4}
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                value={caRevokeDraft.certificateB64}
                onChange={(event) =>
                  onCaRevokeDraftChange({
                    ...caRevokeDraft,
                    certificateB64: event.target.value
                  })
                }
              />
            </label>
            <div className="field-label">
              <span>Certificate file</span>
              <FilePicker
                accept=".pem,.crt"
                file={caRevokeDraft.certificateFile}
                label="Select cert"
                title="Upload a PEM user certificate that should be added to the CRL"
                onChange={(event) =>
                  onCaRevokeDraftChange({
                    ...caRevokeDraft,
                    certificateFile: event.target.files?.[0] ?? null
                  })
                }
              />
            </div>
          </div>
          <div className="panel-footer">
            <ActionButton label="View revoked" icon={Eye} onClick={onShowRevokedCerts} />
            <ActionButton
              label={dryRun ? "Dry-run revoke" : "Revoke"}
              icon={Ban}
              danger
              disabled={!caRevokeDraft.certificateB64.trim() && !caRevokeDraft.certificateFile}
              busy={busy === "ca-revoke"}
              onClick={onRevokeCaCert}
            />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Active certificate</h2>
          <Pill kind={activeReady ? "ok" : "warning"}>{activeReady ? "Ready" : "Incomplete"}</Pill>
        </div>
        {status ? (
          <CertificatePathsView paths={status.active} caLabel="Client certificate CA" />
        ) : (
          <EmptyState text="No status" />
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Manual upload</h2>
          <Pill kind={status?.mode === "external" && !status.letsencrypt.enabled ? "ok" : "muted"}>
            External
          </Pill>
        </div>
        <form onSubmit={onUploadExternal}>
        <div className="settings-grid">
          <div className="field-label">
            <span>Server certificate</span>
            <FilePicker
              accept=".pem,.crt"
              file={externalFiles.serverCert}
              label="Select certificate"
              title="Upload the public certificate PEM used by Korvus Server"
              onChange={(event) =>
                onExternalFilesChange({
                  ...externalFiles,
                  serverCert: event.target.files?.[0] ?? null
                })
              }
            />
          </div>
          <div className="field-label">
            <span>Server private key</span>
            <FilePicker
              accept=".pem,.key"
              file={externalFiles.serverKey}
              label="Select private key"
              title="Upload the private key PEM matching the server certificate"
              onChange={(event) =>
                onExternalFilesChange({
                  ...externalFiles,
                  serverKey: event.target.files?.[0] ?? null
                })
              }
            />
          </div>
          <div className="field-label">
            <span>CA / chain certificate</span>
            <FilePicker
              accept=".pem,.crt"
              file={externalFiles.caCert}
              label="Select CA chain"
              title="Upload the CA or full-chain PEM presented to clients"
              onChange={(event) =>
                onExternalFilesChange({ ...externalFiles, caCert: event.target.files?.[0] ?? null })
              }
            />
          </div>
          <label className="switch" title="Reload ocserv after installing uploaded certificates">
            <input
              checked={letsEncryptDraft.reload}
              onChange={(event) =>
                onLetsEncryptDraftChange({ ...letsEncryptDraft, reload: event.target.checked })
              }
              type="checkbox"
            />
            <span>Reload server</span>
          </label>
        </div>
          <div className="panel-footer">
            <button
              className="primary-button"
              disabled={
                busy === "cert-upload" ||
                !externalFiles.serverCert ||
                !externalFiles.serverKey ||
                !externalFiles.caCert
              }
              title="Install uploaded certificates and optionally reload Korvus Server"
              type="submit"
            >
              <Upload size={18} aria-hidden="true" />
              <span>{busy === "cert-upload" ? "Working" : "Install"}</span>
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Let's Encrypt</h2>
          <div className="toolbar">
            <Pill kind={leEnabled ? "ok" : "muted"}>{leEnabled ? "Enabled" : "Disabled"}</Pill>
            <Pill kind={status?.certbot_available ? "ok" : "warning"}>
              certbot {status?.certbot_available ? "available" : "missing"}
            </Pill>
          </div>
        </div>
        <form onSubmit={onIssueLetsEncrypt}>
        <div className="settings-grid">
          <label title="Email registered with Let's Encrypt for expiration notices">
            <span>Email</span>
            <input
              autoComplete="email"
              disabled={!leEnabled}
              onChange={(event) =>
                onLetsEncryptDraftChange({ ...letsEncryptDraft, email: event.target.value })
              }
              placeholder={status?.letsencrypt.email ?? "admin@example.com"}
              value={letsEncryptDraft.email}
            />
          </label>
          <label title="One DNS name per line; the first domain becomes the primary certificate path">
            <span>Domains</span>
            <textarea
              disabled={!leEnabled}
              onChange={(event) =>
                onLetsEncryptDraftChange({ ...letsEncryptDraft, domains: event.target.value })
              }
              placeholder={(status?.letsencrypt.domains ?? ["vpn.example.com"]).join("\n")}
              rows={2}
              value={letsEncryptDraft.domains}
            />
          </label>
          <label title="Address certbot binds to for the HTTP-01 challenge; leave blank to follow the VPN server's listen address">
            <span>HTTP-01 address</span>
            <input
              disabled={!leEnabled}
              onChange={(event) =>
                onLetsEncryptDraftChange({
                  ...letsEncryptDraft,
                  http01Address: event.target.value
                })
              }
              placeholder={status?.letsencrypt.http01_address ?? "0.0.0.0"}
              value={letsEncryptDraft.http01Address}
            />
          </label>
          <label title="Port certbot binds to for the HTTP-01 challenge">
            <span>HTTP-01 port</span>
            <input
              disabled={!leEnabled}
              max={65535}
              min={1}
              onChange={(event) =>
                onLetsEncryptDraftChange({
                  ...letsEncryptDraft,
                  http01Port: Math.min(65535, Math.max(1, Number(event.target.value) || 80))
                })
              }
              type="number"
              value={letsEncryptDraft.http01Port}
            />
          </label>
          <label className="switch" title="Use the Let's Encrypt staging CA for test certificates">
            <input
              checked={letsEncryptDraft.staging}
              disabled={!leEnabled}
              onChange={(event) =>
                onLetsEncryptDraftChange({ ...letsEncryptDraft, staging: event.target.checked })
              }
              type="checkbox"
            />
            <span>Staging</span>
          </label>
          <label className="switch" title="Reload ocserv after issue or renew succeeds">
            <input
              checked={letsEncryptDraft.reload}
              disabled={!leEnabled}
              onChange={(event) =>
                onLetsEncryptDraftChange({ ...letsEncryptDraft, reload: event.target.checked })
              }
              type="checkbox"
            />
            <span>Reload server</span>
          </label>
          <label className="switch" title="Let supervisor run certbot renew periodically">
            <input
              checked={letsEncryptDraft.autoRenew}
              disabled={!leEnabled}
              onChange={(event) =>
                onLetsEncryptDraftChange({
                  ...letsEncryptDraft,
                  autoRenew: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Auto-renew</span>
          </label>
          <label className="compact-field" title="How often certbot should check for renewal">
            <span>Every</span>
            <input
              min={1}
              disabled={!leEnabled}
              onChange={(event) =>
                onLetsEncryptDraftChange({
                  ...letsEncryptDraft,
                  interval: Math.max(1, Number(event.target.value) || 7)
                })
              }
              type="number"
              value={letsEncryptDraft.interval}
            />
            <select
              disabled={!leEnabled}
              onChange={(event) =>
                onLetsEncryptDraftChange({
                  ...letsEncryptDraft,
                  intervalUnit: event.target.value as IntervalUnit
                })
              }
              value={letsEncryptDraft.intervalUnit}
            >
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </label>
        </div>
          <div className="panel-footer">
            <ActionButton
              label={leEnabled ? "Disable" : "Enable"}
              icon={Power}
              danger={leEnabled}
              primary={!leEnabled}
              busy={busy === "le-settings"}
              onClick={() => onSetLetsEncryptEnabled(!leEnabled)}
            />
            <ActionButton
              label="Save renewal"
              icon={Save}
              title="Save Let's Encrypt renewal settings to persistent YAML"
              busy={busy === "le-settings"}
              disabled={!leEnabled}
              onClick={onSaveLetsEncryptSettings}
            />
            <button
              className="primary-button"
              disabled={
                busy === "le-issue" ||
                !leEnabled ||
                !status?.certbot_available ||
                !letsEncryptDraft.email ||
                leDomains.length === 0
              }
              title="Request a new Let's Encrypt certificate for the listed domains"
              type="submit"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{busy === "le-issue" ? "Working" : dryRun ? "Dry-run issue" : "Issue"}</span>
            </button>
            <ActionButton
              label={dryRun ? "Dry-run renew" : "Renew"}
              icon={RefreshCw}
              title="Run certbot renew now"
              disabled={!leEnabled || !status?.certbot_available}
              busy={busy === "le-renew"}
              onClick={onRenewLetsEncrypt}
            />
          </div>
        </form>
        {status?.letsencrypt.paths && <CertificatePathsView paths={status.letsencrypt.paths} />}
      </section>

      {commandOutput && (
        <LastCommandPanel title="Last certificate command" result={commandOutput} onClose={onClearCommand} />
      )}
    </div>
  );
}

function CertificatePathsView({
  paths,
  caLabel = "CA chain"
}: {
  paths: CertificatePathStatus;
  caLabel?: string;
}) {
  return (
    <div className="cert-paths">
      <PathRow label="Certificate" path={paths.server_cert} ok={paths.server_cert_exists} />
      <PathRow label="Private key" path={paths.server_key} ok={paths.server_key_exists} />
      <PathRow label={caLabel} path={paths.ca_cert} ok={paths.ca_cert_exists} />
    </div>
  );
}

function AuthorityPathsView({
  authority
}: {
  authority: { ca_cert: string; ca_key: string; ca_cert_exists: boolean; ca_key_exists: boolean };
}) {
  return (
    <div className="cert-paths authority-paths">
      <PathRow label="CA certificate" path={authority.ca_cert} ok={authority.ca_cert_exists} />
      <PathRow label="CA private key" path={authority.ca_key} ok={authority.ca_key_exists} />
    </div>
  );
}

function PathRow({ label, path, ok }: { label: string; path: string; ok: boolean }) {
  return (
    <div className="path-row">
      <strong>{label}</strong>
      <Pill kind={ok ? "ok" : "warning"}>{ok ? "Found" : "Missing"}</Pill>
      <code>{path}</code>
    </div>
  );
}

function ConfigSubnav({
  active,
  onSelect
}: {
  active: ConfigSection;
  onSelect: (section: ConfigSection) => void;
}) {
  return (
    <nav className="subnav">
      {configSections.map((item) => (
        <button
          key={item.id}
          type="button"
          className={active === item.id ? "subnav-item active" : "subnav-item"}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function AdminTotpPanel({
  onNotice
}: {
  onNotice: (kind: "ok" | "warning" | "error", text: string) => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetchTotpStatus("session")
      .then((status) => setEnabled(status.enabled))
      .catch(() => setEnabled(null));
  }, []);

  const handleEnable = async () => {
    setBusy("totp-setup");
    try {
      const result = await setupTotp("session");
      setSetup(result);
      setCode("");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = async () => {
    if (!setup) {
      return;
    }
    setBusy("totp-confirm");
    try {
      await confirmTotp("session", setup.secret, code.trim());
      setEnabled(true);
      setSetup(null);
      setCode("");
      onNotice("ok", "Two-factor authentication enabled");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleDisable = async () => {
    if (!confirmAction("Disable two-factor authentication for the admin panel?")) {
      return;
    }
    setBusy("totp-disable");
    try {
      await disableTotp("session");
      setEnabled(false);
      onNotice("ok", "Two-factor authentication disabled");
    } catch (error) {
      onNotice("error", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Admin two-factor authentication</h2>
        {enabled !== null && <Pill kind={enabled ? "ok" : "muted"}>{enabled ? "Enabled" : "Disabled"}</Pill>}
      </div>
      <p className="muted-line">
        Require a TOTP code from an authenticator app (Google Authenticator, Authy, etc.) when
        signing in to this panel.
      </p>
      {!enabled && !setup && (
        <div className="panel-footer">
          <ActionButton label="Enable" icon={ShieldCheck} primary busy={busy === "totp-setup"} onClick={handleEnable} />
        </div>
      )}
      {setup && (
        <div className="totp-setup">
          <div className="qr-preview" dangerouslySetInnerHTML={{ __html: setup.qr_svg ?? "" }} />
          <label>
            <span>Secret</span>
            <div className="totp-secret">{setup.secret}</div>
          </label>
          <label>
            <span>Authenticator code</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
            />
          </label>
          <div className="panel-footer">
            <ActionButton
              label="Cancel"
              icon={X}
              onClick={() => {
                setSetup(null);
                setCode("");
              }}
            />
            <ActionButton
              label="Confirm"
              icon={CheckCircle2}
              primary
              busy={busy === "totp-confirm"}
              disabled={code.trim().length !== 6}
              onClick={() => void handleConfirm()}
            />
          </div>
        </div>
      )}
      {enabled && !setup && (
        <div className="panel-footer">
          <ActionButton
            label="Disable"
            icon={Ban}
            danger
            busy={busy === "totp-disable"}
            onClick={handleDisable}
          />
        </div>
      )}
    </section>
  );
}

function ConfigView({
  section,
  config,
  source,
  draft,
  dirty,
  rendered,
  diff,
  validation,
  serverSettingsDraft,
  authMethodsDraft,
  webSettingsDraft,
  generalSettingsDraft,
  onServerSettingsDraftChange,
  onAuthMethodsDraftChange,
  onWebSettingsDraftChange,
  onGeneralSettingsDraftChange,
  onSaveServerSettings,
  onSaveAuthMethodsSettings,
  onSaveWebSettings,
  onSaveGeneralSettings,
  busy,
  onDraftChange,
  onReloadSource,
  onRender,
  onValidate,
  onDiff,
  onSave,
  onWrite,
  onNotice
}: {
  section: ConfigSection;
  config: Record<string, unknown> | null;
  source: ConfigSource | null;
  draft: string;
  dirty: boolean;
  rendered: Record<string, string>;
  diff: string;
  validation: string;
  serverSettingsDraft: ServerSettingsDraft;
  authMethodsDraft: AuthMethodsDraft;
  webSettingsDraft: WebSettingsDraft;
  generalSettingsDraft: GeneralSettingsDraft;
  onServerSettingsDraftChange: (value: ServerSettingsDraft) => void;
  onAuthMethodsDraftChange: (value: AuthMethodsDraft) => void;
  onWebSettingsDraftChange: (value: WebSettingsDraft) => void;
  onGeneralSettingsDraftChange: (value: GeneralSettingsDraft) => void;
  onSaveServerSettings: () => void;
  onSaveAuthMethodsSettings: () => void;
  onSaveWebSettings: () => void;
  onSaveGeneralSettings: () => void;
  busy: string | null;
  onDraftChange: (value: string) => void;
  onReloadSource: () => void;
  onRender: () => void;
  onValidate: () => void;
  onDiff: () => void;
  onSave: () => void;
  onWrite: () => void;
  onNotice: (kind: "ok" | "warning" | "error", text: string) => void;
}) {
  return (
    <div className="view-stack">
      {section === "server" && (
      <section className="panel">
        <div className="panel-header">
          <h2>Server (VPN)</h2>
        </div>
        <div className="settings-grid">
          <label className="switch" title="Whether ocserv itself runs in this container">
            <input
              checked={serverSettingsDraft.enabled}
              onChange={(event) =>
                onServerSettingsDraftChange({ ...serverSettingsDraft, enabled: event.target.checked })
              }
              type="checkbox"
            />
            <span>Enabled</span>
          </label>
          <label>
            <span>Listen</span>
            <input
              value={serverSettingsDraft.listen}
              onChange={(event) =>
                onServerSettingsDraftChange({ ...serverSettingsDraft, listen: event.target.value })
              }
            />
          </label>
          <label>
            <span>Port</span>
            <input
              type="number"
              value={serverSettingsDraft.port}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  port: Math.max(1, Number(event.target.value) || 443)
                })
              }
            />
          </label>
          <label className="switch">
            <input
              checked={serverSettingsDraft.udpEnabled}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  udpEnabled: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>UDP enabled</span>
          </label>
          <label>
            <span>TUN device</span>
            <input
              value={serverSettingsDraft.device}
              onChange={(event) =>
                onServerSettingsDraftChange({ ...serverSettingsDraft, device: event.target.value })
              }
            />
          </label>
          <label>
            <span>Common name</span>
            <input
              value={serverSettingsDraft.cn}
              onChange={(event) =>
                onServerSettingsDraftChange({ ...serverSettingsDraft, cn: event.target.value })
              }
            />
          </label>
          <label>
            <span>Realm</span>
            <input
              value={serverSettingsDraft.realm}
              onChange={(event) =>
                onServerSettingsDraftChange({ ...serverSettingsDraft, realm: event.target.value })
              }
            />
          </label>
          <label>
            <span>IPv4 network</span>
            <input
              value={serverSettingsDraft.ipv4Network}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  ipv4Network: event.target.value
                })
              }
            />
          </label>
          <label>
            <span>Max clients</span>
            <input
              type="number"
              value={serverSettingsDraft.maxClients}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  maxClients: Math.max(1, Number(event.target.value) || 128)
                })
              }
            />
          </label>
          <label>
            <span>Max same clients</span>
            <input
              type="number"
              value={serverSettingsDraft.maxSameClients}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  maxSameClients: Math.max(1, Number(event.target.value) || 2)
                })
              }
            />
          </label>
          <label>
            <span>Keepalive (s)</span>
            <input
              type="number"
              value={serverSettingsDraft.keepalive}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  keepalive: Math.max(0, Number(event.target.value) || 32400)
                })
              }
            />
          </label>
          <label title="0-1: errors only. 2: adds per-user connect/disconnect events. 3+: verbose debug.">
            <span>Debug level (0-9)</span>
            <input
              type="number"
              min={0}
              max={9}
              value={serverSettingsDraft.debugLevel}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  debugLevel: Math.min(9, Math.max(0, Number(event.target.value) || 0))
                })
              }
            />
          </label>
          <label className="switch">
            <input
              checked={serverSettingsDraft.compression}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  compression: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Compression</span>
          </label>
          <label className="switch">
            <input
              checked={serverSettingsDraft.ciscoClientCompat}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  ciscoClientCompat: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Cisco client compat</span>
          </label>
          <label>
            <span>DNS (one per line)</span>
            <textarea
              rows={2}
              value={serverSettingsDraft.dns}
              onChange={(event) =>
                onServerSettingsDraftChange({ ...serverSettingsDraft, dns: event.target.value })
              }
            />
          </label>
          <label>
            <span>
              Search domains
              <KorclientHint text="Doubles as the server-wide split-DNS list (rendered as split-dns directives). korclient resolves these through its own dnsmasq and routes the results through the tunnel automatically; a stock OpenConnect client only gets DNS-suffix scoping." />
            </span>
            <textarea
              rows={2}
              value={serverSettingsDraft.searchDomains}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  searchDomains: event.target.value
                })
              }
            />
          </label>
          <label>
            <span>
              Routes
              <KorclientHint text="korclient applies this as an nftables policy-route (kept out of the OS routing table). A stock OpenConnect client gets it as a plain pushed route instead." />
            </span>
            <textarea
              rows={2}
              value={serverSettingsDraft.routes}
              onChange={(event) =>
                onServerSettingsDraftChange({ ...serverSettingsDraft, routes: event.target.value })
              }
            />
          </label>
          <label>
            <span>No routes</span>
            <textarea
              rows={2}
              value={serverSettingsDraft.noRoutes}
              onChange={(event) =>
                onServerSettingsDraftChange({ ...serverSettingsDraft, noRoutes: event.target.value })
              }
            />
          </label>
          <label>
            <span>Connect script</span>
            <input
              value={serverSettingsDraft.connectScript}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  connectScript: event.target.value
                })
              }
            />
          </label>
          <label>
            <span>Disconnect script</span>
            <input
              value={serverSettingsDraft.disconnectScript}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  disconnectScript: event.target.value
                })
              }
            />
          </label>
          <label className="switch">
            <input
              checked={serverSettingsDraft.camouflageEnabled}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  camouflageEnabled: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Camouflage</span>
          </label>
          <label>
            <span>Camouflage secret</span>
            <input
              disabled={!serverSettingsDraft.camouflageEnabled}
              value={serverSettingsDraft.camouflageSecret}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  camouflageSecret: event.target.value
                })
              }
            />
          </label>
          <label>
            <span>Camouflage realm</span>
            <input
              disabled={!serverSettingsDraft.camouflageEnabled}
              value={serverSettingsDraft.camouflageRealm}
              onChange={(event) =>
                onServerSettingsDraftChange({
                  ...serverSettingsDraft,
                  camouflageRealm: event.target.value
                })
              }
            />
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "server-config-settings"}
            onClick={onSaveServerSettings}
          />
        </div>
      </section>
      )}

      {section === "auth" && (
      <section className="panel">
        <div className="panel-header">
          <h2>Authentication methods</h2>
        </div>
        <div className="settings-grid">
          <label className="switch">
            <input
              checked={authMethodsDraft.passwordEnabled}
              onChange={(event) =>
                onAuthMethodsDraftChange({
                  ...authMethodsDraft,
                  passwordEnabled: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Password auth</span>
          </label>
          <label className="switch">
            <input
              checked={authMethodsDraft.certificateEnabled}
              onChange={(event) =>
                onAuthMethodsDraftChange({
                  ...authMethodsDraft,
                  certificateEnabled: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Certificate auth</span>
          </label>
          <label className="switch">
            <input
              checked={authMethodsDraft.otpEnabled}
              onChange={(event) =>
                onAuthMethodsDraftChange({ ...authMethodsDraft, otpEnabled: event.target.checked })
              }
              type="checkbox"
            />
            <span>OTP</span>
          </label>
          <label className="switch" title="Use ocserv's built-in oath auth backend for OTP">
            <input
              checked={authMethodsDraft.otpOcservOathAuth}
              disabled={!authMethodsDraft.otpEnabled}
              onChange={(event) =>
                onAuthMethodsDraftChange({
                  ...authMethodsDraft,
                  otpOcservOathAuth: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>ocserv oath auth</span>
          </label>
          <label>
            <span>OTP issuer</span>
            <input
              disabled={!authMethodsDraft.otpEnabled}
              value={authMethodsDraft.otpIssuer}
              onChange={(event) =>
                onAuthMethodsDraftChange({ ...authMethodsDraft, otpIssuer: event.target.value })
              }
            />
          </label>
          <label className="switch">
            <input
              checked={authMethodsDraft.otpSendByEmail}
              disabled={!authMethodsDraft.otpEnabled}
              onChange={(event) =>
                onAuthMethodsDraftChange({
                  ...authMethodsDraft,
                  otpSendByEmail: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Send OTP by email</span>
          </label>
          <label className="switch">
            <input
              checked={authMethodsDraft.otpSendByTelegram}
              disabled={!authMethodsDraft.otpEnabled}
              onChange={(event) =>
                onAuthMethodsDraftChange({
                  ...authMethodsDraft,
                  otpSendByTelegram: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Send OTP by Telegram</span>
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "auth-methods-settings"}
            onClick={onSaveAuthMethodsSettings}
          />
        </div>
      </section>
      )}

      {section === "web" && (
      <>
      <section className="panel">
        <div className="panel-header">
          <h2>Web / API panel</h2>
        </div>
        <div className="settings-grid">
          <label className="switch">
            <input
              checked={webSettingsDraft.enabled}
              onChange={(event) =>
                onWebSettingsDraftChange({ ...webSettingsDraft, enabled: event.target.checked })
              }
              type="checkbox"
            />
            <span>Enabled</span>
          </label>
          <label>
            <span>Listen</span>
            <input
              value={webSettingsDraft.listen}
              onChange={(event) =>
                onWebSettingsDraftChange({ ...webSettingsDraft, listen: event.target.value })
              }
            />
          </label>
          <label>
            <span>Port</span>
            <input
              type="number"
              value={webSettingsDraft.port}
              onChange={(event) =>
                onWebSettingsDraftChange({
                  ...webSettingsDraft,
                  port: Math.max(1, Number(event.target.value) || 8443)
                })
              }
            />
          </label>
          <label className="switch">
            <input
              checked={webSettingsDraft.tls}
              onChange={(event) =>
                onWebSettingsDraftChange({ ...webSettingsDraft, tls: event.target.checked })
              }
              type="checkbox"
            />
            <span>TLS</span>
          </label>
          <label className="switch" title="Only for use behind a trusted TLS-terminating reverse proxy">
            <input
              checked={webSettingsDraft.allowInsecureHttp}
              onChange={(event) =>
                onWebSettingsDraftChange({
                  ...webSettingsDraft,
                  allowInsecureHttp: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Allow insecure HTTP</span>
          </label>
          <label>
            <span>Admin user</span>
            <input
              value={webSettingsDraft.adminUser}
              onChange={(event) =>
                onWebSettingsDraftChange({ ...webSettingsDraft, adminUser: event.target.value })
              }
            />
          </label>
          <label>
            <span>Trusted proxies</span>
            <textarea
              rows={2}
              value={webSettingsDraft.trustedProxies}
              onChange={(event) =>
                onWebSettingsDraftChange({
                  ...webSettingsDraft,
                  trustedProxies: event.target.value
                })
              }
            />
          </label>
          <label className="switch">
            <input
              checked={webSettingsDraft.terminalEnabled}
              onChange={(event) =>
                onWebSettingsDraftChange({
                  ...webSettingsDraft,
                  terminalEnabled: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Terminal enabled</span>
          </label>
          <label>
            <span>Terminal idle timeout (s)</span>
            <input
              type="number"
              value={webSettingsDraft.terminalIdleTimeout}
              onChange={(event) =>
                onWebSettingsDraftChange({
                  ...webSettingsDraft,
                  terminalIdleTimeout: Math.max(60, Number(event.target.value) || 900)
                })
              }
            />
          </label>
          <label>
            <span>Terminal max sessions</span>
            <input
              type="number"
              value={webSettingsDraft.terminalMaxSessions}
              onChange={(event) =>
                onWebSettingsDraftChange({
                  ...webSettingsDraft,
                  terminalMaxSessions: Math.max(1, Number(event.target.value) || 2)
                })
              }
            />
          </label>
          <label>
            <span>Session lifetime (s)</span>
            <input
              type="number"
              value={webSettingsDraft.sessionLifetime}
              onChange={(event) =>
                onWebSettingsDraftChange({
                  ...webSettingsDraft,
                  sessionLifetime: Math.max(300, Number(event.target.value) || 43200)
                })
              }
            />
          </label>
          <label className="switch">
            <input
              checked={webSettingsDraft.sessionCookieSecure}
              onChange={(event) =>
                onWebSettingsDraftChange({
                  ...webSettingsDraft,
                  sessionCookieSecure: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>Secure session cookie</span>
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "web-config-settings"}
            onClick={onSaveWebSettings}
          />
        </div>
      </section>
      <AdminTotpPanel onNotice={onNotice} />
      </>
      )}

      {section === "system" && (
      <section className="panel">
        <div className="panel-header">
          <h2>General</h2>
        </div>
        <div className="settings-grid">
          <label>
            <span>Timezone</span>
            <input
              value={generalSettingsDraft.timezone}
              onChange={(event) =>
                onGeneralSettingsDraftChange({
                  ...generalSettingsDraft,
                  timezone: event.target.value
                })
              }
            />
          </label>
          <label>
            <span>Log level</span>
            <select
              value={generalSettingsDraft.logLevel}
              onChange={(event) =>
                onGeneralSettingsDraftChange({
                  ...generalSettingsDraft,
                  logLevel: event.target.value as GeneralSettingsDraft["logLevel"]
                })
              }
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label>
            <span>Project name</span>
            <input
              value={generalSettingsDraft.projectName}
              onChange={(event) =>
                onGeneralSettingsDraftChange({
                  ...generalSettingsDraft,
                  projectName: event.target.value
                })
              }
            />
          </label>
          <label className="switch" title="Enable the korctl CLI inside the container">
            <input
              checked={generalSettingsDraft.cliEnabled}
              onChange={(event) =>
                onGeneralSettingsDraftChange({
                  ...generalSettingsDraft,
                  cliEnabled: event.target.checked
                })
              }
              type="checkbox"
            />
            <span>CLI enabled</span>
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "general-settings"}
            onClick={onSaveGeneralSettings}
          />
        </div>
      </section>
      )}

      {section === "advanced" && (
      <>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Persistent YAML</h2>
            <p className="muted-line">
              {source?.path ?? "/etc/korserver/config.yaml"} &mdash; full configuration, including
              every default value not explicitly set
            </p>
          </div>
          {dirty && <Pill kind="warning">Unsaved</Pill>}
        </div>
        <textarea
          className="config-editor"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          spellCheck={false}
        />
        {validation && (
          <details className="rendered-file" open>
            <summary>Validation</summary>
            <pre>{validation}</pre>
          </details>
        )}
        <div className="panel-footer">
          <ActionButton label="Reload" icon={RefreshCw} onClick={onReloadSource} />
          <ActionButton
            label="Validate"
            icon={CheckCircle2}
            busy={busy === "config-validate"}
            onClick={onValidate}
          />
          <ActionButton
            label="Save"
            icon={Save}
            primary
            busy={busy === "config-save"}
            onClick={onSave}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Rendered files</h2>
        </div>
        {diff && (
          <details className="rendered-file" open>
            <summary>Diff</summary>
            <pre>{diff || "No changes."}</pre>
          </details>
        )}
        {Object.entries(rendered).length === 0 ? (
          <EmptyState text="No rendered files" />
        ) : (
          Object.entries(rendered).map(([path, content]) => (
            <details className="rendered-file" key={path}>
              <summary>{path}</summary>
              <pre>{content}</pre>
            </details>
          ))
        )}
        <div className="panel-footer">
          <ActionButton label="Refresh" icon={RefreshCw} onClick={onRender} />
          <ActionButton
            label="Diff"
            icon={FileDiff}
            busy={busy === "config-diff"}
            onClick={onDiff}
          />
          <ActionButton
            label="Render configs"
            icon={Save}
            primary
            title="Write generated Korvus Server, supervisor, dnsmasq and nftables files from YAML"
            busy={busy === "write-config"}
            onClick={onWrite}
          />
        </div>
      </section>
      <section className="panel">
        <h2>Effective config</h2>
        <pre>{JSON.stringify(config ?? {}, null, 2)}</pre>
      </section>
      </>
      )}
    </div>
  );
}

function DiagnosticsView({ diagnostics }: { diagnostics: DiagnosticResult | null }) {
  return (
    <section className="panel">
      <Table columns={["Probe", "Status", "Stdout", "Stderr"]} empty="No diagnostics">
        {Object.entries(diagnostics ?? {}).map(([name, result]) => (
          <tr key={name}>
            <td>{name}</td>
            <td>
              <Pill kind={diagnosticKind(result)}>{result.returncode}</Pill>
            </td>
            <td>
              <code>{result.stdout}</code>
            </td>
            <td>
              <code>{result.stderr}</code>
            </td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function LogsView({
  files,
  request,
  live,
  logTail,
  busy,
  rotation,
  onRequestChange,
  onLiveChange,
  onFetch,
  onRotationChange,
  onSaveRotation,
  onRotateNow
}: {
  files: LogFile[];
  request: { name: string; lines: number };
  live: boolean;
  logTail: LogTail | null;
  busy: string | null;
  rotation: LogRotationSettings;
  onRequestChange: (value: { name: string; lines: number }) => void;
  onLiveChange: (value: boolean) => void;
  onFetch: (event: FormEvent<HTMLFormElement>) => void;
  onRotationChange: (value: LogRotationSettings) => void;
  onSaveRotation: () => void;
  onRotateNow: () => void;
}) {
  const families = useMemo(() => groupLogFiles(files), [files]);
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Log files</h2>
        </div>
        <Table columns={["Log", "Size", "History"]} empty="No log files">
          {families.map((family) => (
            <tr key={family.key}>
              <td>
                <button
                  className={`log-family-name${family.current.name === request.name ? " active" : ""}`}
                  onClick={() => onRequestChange({ ...request, name: family.current.name })}
                  title={family.current.name}
                  type="button"
                >
                  {family.key}
                </button>
              </td>
              <td>{formatBytes(family.current.size)}</td>
              <td>
                {family.generations.length ? (
                  <div className="log-generation-list">
                    {family.generations.slice(0, 10).map(({ gen, file }) => (
                      <button
                        className={`log-generation-chip${file.name === request.name ? " active" : ""}`}
                        key={file.name}
                        onClick={() => onRequestChange({ ...request, name: file.name })}
                        title={`${file.name} · ${formatBytes(file.size)}`}
                        type="button"
                      >
                        {gen}
                      </button>
                    ))}
                    {family.generations.length > 10 && (
                      <span className="log-generation-more">
                        +{family.generations.length - 10} more
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="muted-line">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <form className="inline-form" onSubmit={onFetch}>
          <label>
            <span>Lines</span>
            <input
              min={1}
              max={1000}
              type="number"
              value={request.lines}
              onChange={(event) =>
                onRequestChange({ ...request, lines: Number(event.target.value) })
              }
              required
            />
          </label>
          <label className="switch" title="Refresh the selected log automatically">
            <input
              checked={live}
              onChange={(event) => onLiveChange(event.target.checked)}
              type="checkbox"
            />
            <span>Live</span>
          </label>
          <button className="primary-button" disabled={busy === "fetch-log"} type="submit">
            <ScrollText size={18} aria-hidden="true" />
            <span>Load</span>
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Log rotation</h2>
          <Pill kind={rotation.enabled ? "ok" : "muted"}>
            {rotation.enabled ? "Enabled" : "Disabled"}
          </Pill>
        </div>
        <div className="settings-grid">
          <label className="switch" title="Rotate logs automatically by size and/or age">
            <input
              checked={rotation.enabled}
              onChange={(event) =>
                onRotationChange({ ...rotation, enabled: event.target.checked })
              }
              type="checkbox"
            />
            <span>Enabled</span>
          </label>
          <label
            className="compact-field"
            title="Rotate a log once it grows past this size; 0 disables the size trigger"
          >
            <span>Max size</span>
            <input
              min={0}
              disabled={!rotation.enabled}
              onChange={(event) =>
                onRotationChange({
                  ...rotation,
                  max_size_mb: Math.max(0, Number(event.target.value) || 0)
                })
              }
              type="number"
              value={rotation.max_size_mb}
            />
            <span>MB</span>
          </label>
          <label
            className="compact-field"
            title="Also rotate after this much time since the last rotation; 0 disables the time trigger"
          >
            <span>Every</span>
            <input
              min={0}
              disabled={!rotation.enabled}
              onChange={(event) =>
                onRotationChange({
                  ...rotation,
                  max_age: Math.max(0, Number(event.target.value) || 0)
                })
              }
              type="number"
              value={rotation.max_age}
            />
            <select
              disabled={!rotation.enabled}
              onChange={(event) =>
                onRotationChange({
                  ...rotation,
                  max_age_unit: event.target.value as IntervalUnit
                })
              }
              value={rotation.max_age_unit}
            >
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </label>
          <label
            className="compact-field"
            title="Rotated copies kept per log (name.1 ... name.N); older copies are deleted"
          >
            <span>Keep</span>
            <input
              min={1}
              max={100}
              disabled={!rotation.enabled}
              onChange={(event) =>
                onRotationChange({
                  ...rotation,
                  keep_files: Math.min(100, Math.max(1, Number(event.target.value) || 1))
                })
              }
              type="number"
              value={rotation.keep_files}
            />
            <span>files</span>
          </label>
        </div>
        <div className="panel-footer">
          <ActionButton
            label="Rotate now"
            icon={RefreshCw}
            title="Rotate every non-empty log immediately, regardless of thresholds"
            busy={busy === "log-rotation-run"}
            onClick={onRotateNow}
          />
          <ActionButton
            label="Save"
            icon={Save}
            primary
            title="Save log rotation settings to persistent YAML"
            busy={busy === "log-rotation-save"}
            onClick={onSaveRotation}
          />
        </div>
      </section>
      <section className="panel">
        <h2>{logTail ? logTail.name : "Log"}</h2>
        {logTail?.content ? <pre>{logTail.content}</pre> : <EmptyState text="No log content" />}
      </section>
    </div>
  );
}

function NoticeToast({
  notice,
  onClose,
  onPauseChange
}: {
  notice: NonNullable<Notice>;
  onClose: () => void;
  onPauseChange: (paused: boolean) => void;
}) {
  return (
    <div
      className={`notice-toast status ${notice.kind}`}
      onMouseEnter={() => onPauseChange(true)}
      onMouseLeave={() => onPauseChange(false)}
      role="status"
    >
      <span>{notice.text}</span>
      <button aria-label="Close notification" onClick={onClose} title="Close" type="button">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function FilePicker({
  accept,
  file,
  label,
  title,
  onChange
}: {
  accept: string;
  file: File | null;
  label: string;
  title: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="file-picker" title={title}>
      <input accept={accept} onChange={onChange} type="file" />
      <span className="file-picker-button">
        <Upload size={16} aria-hidden="true" />
        {label}
      </span>
      <span className="file-picker-name">{file?.name ?? "No file selected"}</span>
    </label>
  );
}

type CertSourceMode = "upload" | "base64" | "path";

function CertSourceField({
  label,
  mode,
  pathValue,
  base64Value,
  fileName,
  pathPlaceholder,
  onModeChange,
  onPathChange,
  onBase64Change,
  onFileSelected
}: {
  label: string;
  mode: CertSourceMode;
  pathValue: string;
  base64Value: string;
  fileName: string | null;
  pathPlaceholder?: string;
  onModeChange: (mode: CertSourceMode) => void;
  onPathChange: (value: string) => void;
  onBase64Change: (value: string) => void;
  onFileSelected: (base64: string, fileName: string) => void;
}) {
  const readFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      onFileSelected(result.slice(result.indexOf(",") + 1), file.name);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="field-label cert-source-field">
      <span>{label}</span>
      <div className="cert-source-toggle" role="group" aria-label={`${label} source`}>
        <button
          type="button"
          className={mode === "upload" ? "active" : ""}
          onClick={() => onModeChange("upload")}
        >
          Upload
        </button>
        <button
          type="button"
          className={mode === "base64" ? "active" : ""}
          onClick={() => onModeChange("base64")}
        >
          Base64
        </button>
        <button
          type="button"
          className={mode === "path" ? "active" : ""}
          onClick={() => onModeChange("path")}
        >
          Path
        </button>
      </div>
      {mode === "upload" && (
        <span className="file-picker">
          <input type="file" onChange={readFile} />
          <span className="file-picker-button">
            <Upload size={16} aria-hidden="true" />
            Choose file
          </span>
          <span className="file-picker-name">{fileName ?? "No file selected"}</span>
        </span>
      )}
      {mode === "base64" && (
        <textarea
          value={base64Value}
          onChange={(event) => onBase64Change(event.target.value)}
          placeholder="base64-encoded file content"
          rows={3}
        />
      )}
      {mode === "path" && (
        <input
          value={pathValue}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder={pathPlaceholder}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function BulkListEditor({
  title,
  items,
  placeholder,
  busy,
  disabled = false,
  onSave
}: {
  title: string;
  items: string[];
  placeholder: string;
  busy: boolean;
  disabled?: boolean;
  onSave: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState(items.join("\n"));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setDraft(items.join("\n"));
    }
  }, [items, dirty]);

  const handleSave = () => {
    const parsed = draft
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    onSave(parsed);
    setDirty(false);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <p className="muted-line">
        One per line (or space/comma-separated). Paste a whole list at once; format is
        validated on save.
      </p>
      <textarea
        className="bulk-list-textarea"
        disabled={disabled}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
          setDirty(true);
        }}
        rows={8}
      />
      <div className="panel-footer">
        <ActionButton
          label="Save"
          icon={Save}
          primary
          busy={busy}
          disabled={disabled}
          onClick={handleSave}
        />
      </div>
    </section>
  );
}

function Table({
  columns,
  children,
  empty
}: {
  columns: string[];
  children: ReactNode;
  empty: string;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows ? (
            children
          ) : (
            <tr>
              <td className="empty-cell" colSpan={columns.length}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  busy,
  disabled,
  danger,
  primary,
  title
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  title?: string;
}) {
  const className = [
    "action-button",
    danger ? "danger" : "",
    primary ? "primary" : ""
  ].filter(Boolean).join(" ");
  return (
    <button
      className={className}
      disabled={busy || disabled}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      <Icon size={17} aria-hidden="true" />
      <span>{busy ? "Working" : label}</span>
    </button>
  );
}

const PASSWORD_GENERATOR_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const PASSWORD_GENERATOR_DIGITS = "0123456789";
// Punctuation only: no quotes, backslash, backtick, `$`, `;`, `&`, `|`, `<`, `>`, or `%`,
// so a generated password never needs escaping in shells, YAML, or config templates.
const PASSWORD_GENERATOR_SPECIAL = "!@#^*()-_=+[]{}:,.?~";

function passwordGeneratorRandomInt(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function generatePassword(length: number, useDigits: boolean, useSpecial: boolean): string {
  const pools = [PASSWORD_GENERATOR_LETTERS];
  if (useDigits) {
    pools.push(PASSWORD_GENERATOR_DIGITS);
  }
  if (useSpecial) {
    pools.push(PASSWORD_GENERATOR_SPECIAL);
  }
  const combinedPool = pools.join("");
  const required = pools.map((pool) => pool[passwordGeneratorRandomInt(pool.length)]);
  const chars = [...required];
  for (let i = chars.length; i < length; i++) {
    chars.push(combinedPool[passwordGeneratorRandomInt(combinedPool.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = passwordGeneratorRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, Math.max(length, required.length)).join("");
}

function PasswordGeneratorButton({ onApply }: { onApply: (password: string) => void }) {
  const [open, setOpen] = useState(false);
  const [length, setLength] = useState(16);
  const [useDigits, setUseDigits] = useState(true);
  const [useSpecial, setUseSpecial] = useState(true);
  const [generated, setGenerated] = useState("");
  const [copied, setCopied] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: -9999, left: -9999 });
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setGenerated(generatePassword(length, useDigits, useSpecial));
    setCopied(false);
  }, [open, length, useDigits, useSpecial]);

  useLayoutEffect(() => {
    if (!open || !containerRef.current || !menuRef.current) {
      return;
    }
    const updatePosition = () => {
      if (!containerRef.current || !menuRef.current) {
        return;
      }
      const buttonRect = containerRef.current.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - buttonRect.bottom;
      const top =
        spaceBelow < menuRect.height + 12 && buttonRect.top > menuRect.height + 12
          ? Math.max(8, buttonRect.top - menuRect.height - 6)
          : buttonRect.bottom + 6;
      const left = Math.min(
        Math.max(8, buttonRect.right - menuRect.width),
        window.innerWidth - menuRect.width - 8
      );
      setMenuPosition({ top, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, generated]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the password is still visible to copy manually.
    }
  };

  return (
    <div className="password-generator" ref={containerRef}>
      <IconButton
        label="Generate password"
        icon={Wand2}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div
          className="password-generator-menu"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          ref={menuRef}
          role="dialog"
          aria-label="Generate password"
        >
          <label>
            <span>Length: {length}</span>
            <input
              type="range"
              min={8}
              max={64}
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            />
          </label>
          <label className="mini-check">
            <input
              type="checkbox"
              checked={useDigits}
              onChange={(event) => setUseDigits(event.target.checked)}
            />
            <span>Digits</span>
          </label>
          <label className="mini-check">
            <input
              type="checkbox"
              checked={useSpecial}
              onChange={(event) => setUseSpecial(event.target.checked)}
            />
            <span>Special characters</span>
          </label>
          <code className="password-generator-preview">{generated}</code>
          <div className="password-generator-actions">
            <IconButton
              label="Regenerate"
              icon={RefreshCw}
              onClick={() => setGenerated(generatePassword(length, useDigits, useSpecial))}
            />
            <IconButton label={copied ? "Copied" : "Copy"} icon={copied ? Check : Copy} onClick={() => void copy()} />
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                onApply(generated);
                setOpen(false);
              }}
            >
              <Check size={16} aria-hidden="true" />
              <span>Use</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  busy,
  disabled,
  danger,
  extraClassName
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  extraClassName?: string;
}) {
  const className = [
    "icon-button",
    danger ? "danger" : "",
    extraClassName ?? ""
  ].filter(Boolean).join(" ");
  return (
    <button
      className={className}
      disabled={busy || disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

function Pill({
  children,
  kind
}: {
  children: ReactNode;
  kind: "ok" | "warning" | "error" | "muted";
}) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

// Same silhouette as public/favicon.svg, inlined so its color can follow
// currentColor (hover/theme) instead of being locked to the flat file's fill.
function RavenIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 1856.4178 1669.4326">
      <path d="m 40.232517,1018.2 c 1.8677,-5.4106 5.0758,-10.236 8.6921,-14.619 7.2214,-8.6637 15.931,-15.931 24.878,-22.738 8.4534,-6.3134 16.998,-12.626 26.502003,-17.293 9.8901,-5.0471 20.234,-9.1064 30.272,-13.819 31.095,-14.245 63.712,-24.81 96.532,-34.263 50.284,-14.392 101.35,-25.877 151.57,-40.468 13.353,-3.8379 27.036,-6.4211 40.292,-10.588 20.45,-6.1884 38.027,-18.707 55.916,-29.954 10.14,-6.5403 20.989,-11.922 32.128,-16.532 11.695,-4.928 23.646,-9.2428 35.109,-14.699 -11.644,-2.5264 -23.34,-5.6263 -33.911,-11.264 4.9396,-7.6872 8.4026,-16.164 12.156,-24.452 3.7753,-8.3798 8.1809,-16.714 14.88,-23.141 -0.8688,-2.2198 -4.2638,-4.3262 -2.4186,-6.8867 6.1145,-6.6766 10.373,-14.721 14.903,-22.482 4.2751,-7.5793 9.5664,-14.574 15.897,-20.552 15.772,-15.153 34.899,-26.241 54.418,-35.83 20.728,-10.066 42.245,-18.378 63.814,-26.428 23.714,-8.7943 47.928,-16.578 70.422,-28.29 19.064,-9.7481 37.34,-21.546 58.006,-27.734 14.534,-4.2977 29.795,-4.6781 44.789,-5.9157 11.281,-0.9709 22.834,-1.8793 33.388,-6.3019 9.7312,-4.0367 17.918,-10.986 24.98,-18.662 6.989,-7.3919 13.472,-15.3 21.251,-21.898 9.0837,-7.8575 18.888,-14.801 28.483,-22.006 8.8907,-6.563 17.39,-13.631 26.048,-20.49 57.50598,-45.941 114.63998,-92.371 173.62998,-136.4 7.5566,-5.7966 15.545,-10.991 23.317,-16.481 6.9547,-5.0131 14.12,-10.055 19.388,-16.913 5.3311,-7.5453 8.5672,-16.288 13.109,-24.282 7.5396,-12.893 15.624,-25.457 23.09,-38.396 22.562,-38.538 42.762,-78.598 68.867,-114.94 12.876,-17.872 27.263,-34.768 43.864,-49.297 7.2102,-6.2338 14.375,-12.558 22.227,-17.986 8.9476,-6.1826 18.775,-10.9 28.449,-15.806 10.532,-5.0642 21.341,-9.8502 32.832,-12.246 27.99,-5.3993 57.449,-4.5705 84.667,4.2466 21.773,7.3523 42.041,18.457 61.645,30.306 4.7975,2.7365 9.6403,5.5752 15.005,7.0513 5.4049,1.4591 10.991,0.3123 16.476,0.1815 2.6515,-0.1021 5.2857,0.1931 7.92,0.4145 9.1576,0.8516 18.253,2.339 27.268,4.1388 22.607,4.6442 44.749,11.321 66.488,19.019 21.79,7.6871 43.347,16.85 62.235,30.351 16.436,11.69 30.618,27.297 38.061,46.253 -10.861,2.3449 -21.852,4.0935 -32.883,5.4277 0,0 -47.974,4.3488 -63.95,5.4446 -28.33,2.0325 -56.802,4.1956 -84.565,10.52 -1.1525,0.2555 -2.3504,0.4941 -3.3781,1.1299 -5.4275,3.0488 -9.9069,7.5168 -13.665,12.428 -6.2055,8.2153 -10.657,17.606 -14.165,27.246 -4.1728,11.616 -6.9831,23.714 -8.4366,35.972 -3.4359,28.192 4.0358,56.684 -1.1292,84.768 -0.3048,-0.0174 -0.2173,-0.0124 -0.5221,-0.0298 -0.4145,-6.1854 -1.1176,-12.684 -4.2644,-18.148 -0.1476,3.0317 1.2774,5.9669 0.8346,8.993 -0.097,1.3626 -2.2029,2.2369 -3.1736,1.2945 -1.4081,-6.881 -2.5379,-13.995 -5.8535,-20.28 -1.9586,35.546 2.4639,71.098 8.7602,106.02 -0.6358,-0.6756 -1.5726,-2.5661 -2.6797,-1.5726 -0.3918,1.1979 0.1022,2.4867 0.1703,3.7243 2.674,20.609 9.0781,41.019 7.2614,61.997 -2.4639,-4.0423 -1.8849,-9.6515 -5.5581,-13.086 -1.0447,4.6725 -1.1468,9.4812 -1.6635,14.228 -0.528,4.1728 -1.1353,8.7943 -4.1954,11.962 -0.9653,-2.5037 -1.0448,-5.6944 -3.418,-7.3806 -0.1761,4.0026 0.5848,7.9484 1.0332,11.911 0.3975,3.6051 0.8064,7.4544 -0.8571,10.827 -1.3171,-1.2433 -1.425,-3.2928 -2.606,-4.6384 -1.4988,0.1816 -1.1071,3.185 -2.5094,3.2531 -2.0211,-2.6172 -1.5101,-6.9548 -4.7974,-8.5728 -0.062,7.8064 0.5337,15.681 -0.5337,23.453 -0.2951,1.919 -0.9085,5.1778 -3.5995,4.4 -2.2709,13.949 -8.4763,27.314 -7.7838,41.689 0.2158,5.5696 2.4697,10.816 2.7535,16.368 1.5557,24.662 -3.8152,49.467 -13.864,71.95 -7.4032,16.97 -18.656,31.941 -31.067,45.561 -5.8192,6.2734 -11.525,12.729 -18.298,18.02 -10.049,8.1867 -21.506,15.17 -28.966,26.048 -5.7172,8.1471 -10.248,17.049 -15.562,25.452 -6.7333,10.514 -13.683,20.898 -21.268,30.822 -7.7552,10.015 -15.732,19.86 -23.561,29.818 -13.319,17.032 -26.797,34.15 -36.92,53.345 -11.661,21.801 -20.785,44.812 -30.982,67.294 -14.324,31.044 -28.268,62.446 -37.397,95.471 -14.278,51.704 -25.673,104.23 -33.19,157.35 -1.6351,12.752 -4.2979,25.338 -6.37,38.022 -1.2072,7.8705 -2.3062,15.894 -2.4547,23.895 -0.1169,6.2915 2.1918,12.393 6.5272,16.954 21.942,23.082 44.356,45.744 68.039,67.027 5.9222,5.6853 13.57,8.7988 20.237,13.434 6.3282,4.6365 6.7343,14.044 13.029,18.578 15.262,4.264 31.302,3.1814 46.971,4.298 9.7461,0 20.034,1.6243 29.272,-2.1992 13.028,-4.8395 24.162,-14.755 38.307,-16.311 16.853,-0.068 31.201,13.705 33.13,30.219 -9.2048,-10.253 -21.59,-20.338 -36.413,-16.954 -5.4144,0.067 -12.656,6.0233 -7.6141,11.302 9.577,11.54 16.21,25.753 15.127,41.15 -8.0878,-8.1558 -13.773,-18.24 -21.861,-26.328 -2.132,4.8395 -3.4179,10.389 -7.648,14.01 -10.152,1.4889 -20.406,-5.9559 -30.22,-0.9137 -7.648,2.8763 -15.837,-0.1355 -23.587,-0.8461 0,0 -0.9055,-0.1208 -2.2899,-0.2842 -6.7663,-0.7982 -13.585,1.2021 -18.808,5.577 -1.6437,1.377 -3.3407,2.6841 -5.1962,3.7762 -10.66,0.7449 -21.489,0.1017 -32.013,-1.7258 -9.2384,-1.9288 -15.194,-12.521 -25.279,-11.167 -25.55,2.7747 -51.506,7.4451 -77.157,3.4518 -8.0427,-5.3232 -11.065,-14.258 -11.032,-23.399 0.01,-2.8394 -1.7778,-5.3746 -4.4941,-6.201 -6.4361,-1.9583 -12.968,-3.0547 -19.803,1.106 -10.944,6.661 -6.9711,22.268 -18.815,25.854 -0.4736,-9.78 1.0005,-15.847 3.9784,-25.289 5.2792,-9.915 15.209,-18.906 25.971,-19.786 17.191,-2.4703 31.878,8.5956 48.054,12.284 10.964,2.9445 25.753,9.2389 34.653,-1.2178 3.5193,-9.2384 -1.3876,-18.511 -7.5803,-25.245 -22.258,-27.025 -48.593,-53.325 -74.244,-77.45 -2.3528,-2.213 -4.5043,-4.6229 -6.4335,-7.2135 -6.4152,-8.6144 -12.454,-17.478 -17.191,-27.167 -4.1503,-8.3286 -6.8413,-17.339 -8.062,-26.559 -4.241,-29.347 0.9538,-58.84 2.1971,-88.204 -5.9554,4.2864 -7.5396,12.496 -14.017,16.237 0.2611,-1.3059 0.5166,-2.5947 0.4371,-3.8949 -1.3683,0.8574 -2.1575,2.3279 -3.0204,3.6676 -1.652,2.6458 -3.0148,5.4561 -4.4,8.2606 -0.8231,-0.4087 -2.0211,-0.6926 -2.0211,-1.8337 0.352,-2.0099 1.7259,-3.7301 1.6181,-5.8193 -1.5047,1.6578 -2.3676,3.8209 -4.0026,5.3993 -0.7211,0.9197 -1.7941,1.2262 -2.9238,0.8174 -0.3579,-2.7592 3.0941,-4.485 2.2767,-7.3806 -2.6458,2.5095 -3.5088,6.7335 -7.1933,8.1472 -0.1136,-2.5605 0.6245,-5.1609 2.6626,-6.8073 -0.3065,-0.1987 -0.9254,-0.5962 -1.2377,-0.7892 -1.5216,1.6353 -2.2709,4.3092 -4.7065,4.8655 2.2596,-8.34 5.1096,-16.55 8.9929,-24.276 0.6246,-1.2772 2.0042,-2.8046 0.5168,-3.9968 -1.1694,1.442 -2.0381,4.2183 -4.4454,3.2928 -0.4542,-2.975 1.6009,-5.4275 3.1622,-7.7042 -0.9935,-0.4257 -1.97,0.2839 -2.7193,0.9141 -2.8444,2.6799 -4.6215,6.3815 -7.8236,8.7148 -0.9653,0.9652 -2.3957,-0.3862 -2.1857,-1.4989 0.074,-2.322 1.3455,-4.343 2.4299,-6.302 -0.9141,-0.2554 -1.7032,-0.045 -2.3674,0.6418 -2.061,1.8734 -3.1453,4.5192 -4.9224,6.6366 -1.5101,-1.0219 -1.3682,-2.9351 -1.5726,-4.5192 -7.7213,9.8164 -16.277,18.951 -23.828,28.909 -1.0162,-0.8969 -1.8564,-2.0723 -3.1395,-2.6115 -1.3442,-0.4641 -2.2458,1.0096 -3.234,1.6278 -0.4477,-0.2504 -0.5383,-0.3011 -0.9861,-0.5515 0.1156,-2.4456 2.4296,-4.9897 0.4958,-7.2534 -1.3625,1.1923 -2.3903,2.8615 -4.1445,3.5653 -0.045,-2.5491 -0.04,-5.2288 1.0446,-7.5793 0.4145,-1.0615 2.0381,-2.2368 0.6132,-3.2075 -1.8281,1.0219 -3.185,2.7706 -5.2175,3.4745 -0.7155,-3.1281 1.7315,-5.3992 4.1954,-6.7333 -1.2604,-2.0099 -3.1226,0.085 -4.5872,0.6868 2.0266,-10.049 7.2782,-19.098 13.387,-27.2 -1.3454,-1.5157 -3.378,-0.193 -5.0811,-0.3462 0.5335,-0.8005 1.1012,-1.5499 1.3965,-2.4299 -0.8118,0.2102 -1.726,0.3633 -2.3787,1.0048 -3.7527,3.2872 -5.6092,8.4537 -10.129,10.918 0.6133,-6.2109 4.7976,-11.059 8.0734,-16.067 -0.3691,-0.3862 -0.7551,-0.755 -1.1583,-1.1072 -1.5895,1.5897 -2.3106,4.2751 -4.7234,4.8824 0.1816,-2.6569 0.4314,-5.3141 0.1987,-7.9652 -1.6181,1.3569 -2.3051,3.4292 -3.4406,5.1664 -0.8006,-0.8856 -1.601,-1.7714 -2.4128,-2.64 -0.1818,0.3292 -0.5507,0.9822 -0.7324,1.3114 -0.6813,-0.6584 -1.5784,-1.3286 -1.4249,-2.3958 0.4882,-2.9126 2.6627,-5.3992 2.2936,-8.4762 -3.1567,1.4363 -3.8834,5.507 -7.1876,6.7502 1.5669,-13.524 8.6411,-25.588 10.918,-38.941 -2.6002,-1.6804 -5.876,-1.6804 -8.6863,-0.4995 -4.9733,1.8792 -9.203,5.2061 -13.847,7.7382 -5.7909,3.3611 -11.656,6.7107 -16.76,11.099 -3.219,2.8783 -6.3755,6.1088 -7.8573,10.27 -1.6351,4.468 -0.7778,9.3621 0.4825,13.819 1.5331,5.4048 3.679,10.742 3.9118,16.419 0.1987,3.6676 -3.0942,6.5006 -2.8557,10.191 0.051,1.6238 1.2659,2.8217 2.356,3.8833 -1.7599,-0.068 -4.1161,0.7041 -3.9401,2.901 0.7324,5.9556 4.6554,11.485 3.5768,17.645 -1.0844,0.8176 -2.0155,-0.5165 -2.7764,-1.1467 1.0278,5.7795 1.0107,11.69 0.6473,17.532 -0.9822,14.182 -4.0196,28.098 -6.0805,42.138 -1.9649,13.386 -4.1708,28.086 -0.553,41.308 5.7645,21.068 9.6409,41.959 14.279,63.224 3.2025,14.677 7.2234,29.162 11.586,43.533 3.535,11.646 7.2974,23.221 11.048,34.799 7.2438,17.112 11.268,37.794 27.61,48.886 15.712,11.233 31.914,21.767 47.907,32.58 6.2997,4.7045 13.666,6.5701 21.227,7.8672 11.18,1.9181 20.772,9.172 25.329,19.56 3.5393,8.0674 6.313,16.435 7.2996,25.274 -7.4267,-10.846 -10.883,-11.373 -15.432,-17.777 -3.0444,-6.3688 -9.9031,-9.203 -16.097,-11.583 -5.9138,2.4144 -7.1387,12.353 -14.872,11.023 -15.362,0.7347 -23.061,-15.153 -35.274,-21.696 5.4244,13.088 13.053,25.091 20.017,37.374 1.9958,3.4565 4.3543,6.6892 6.8226,9.8512 11.574,14.827 17.696,33.179 17.618,51.988 -0.033,7.9846 -0.3159,15.976 -0.5398,23.931 l -3.8145,-12.333 c -4.8292,-18.721 -4.7941,-29.555 -19.002,-44.532 -7.6989,2.3094 -16.657,6.7535 -23.936,0.7698 -12.808,-6.194 -8.9936,-24.426 -21.591,-30.9 -13.892,-8.2582 -17.847,-24.741 -27.68,-36.393 -16.937,5.7737 -31.425,21.241 -50.811,16.867 -2.0647,-5.179 -4.1292,-10.358 -6.0889,-15.572 -15.257,-2.6946 -34.60898,0.8398 -40.83798,16.972 -5.389,9.4132 -5.0043,24.076 -16.727,28.276 -0.175,-25.406 9.5533,-56.481 36.00898,-65.229 11.968,-5.6334 24.041,3.1497 36.114,2.45 8.7834,-7.3136 20.506,-15.152 18.687,-28.31 -0.5951,-24.461 3.7093,-49.866 -4.6892,-73.417 -3.9847,-13.987 -9.8431,-27.353 -15.644,-40.658 -2.8027,-6.429 -5.6146,-12.856 -8.2485,-19.356 -2.5261,-6.2343 -4.5917,-12.641 -6.4648,-19.101 -2.1732,-7.496 -4.7515,-14.874 -7.7213,-22.092 -2.4303,-5.9069 -7.0917,-10.925 -10.812,-16.144 -8.20468,-11.511 -16.14398,-23.283 -22.39398,-35.993 -5.0814,-9.9525 -8.7263,-20.58 -11.412,-31.407 -1.5159,0.6985 -2.3674,2.146 -3.2021,3.5314 -0.7949,1.3341 -2.447,1.7428 -3.923,1.6635 0.5053,-26.638 5.4559,-52.89 8.0674,-79.347 -1.4307,1.5272 -2.8896,3.4064 -5.0698,3.8265 -2.1461,-0.3634 -2.1233,-3.1395 -2.5038,-4.8087 -1.777,1.7032 -3.5938,3.5654 -5.9839,4.4 -1.1013,0.4087 -2.3731,0.051 -2.9693,-1.005 3.696,-2.0382 7.0626,-5.0302 9.0839,-8.7544 -1.8281,0.085 -3.2361,1.4988 -4.6953,2.4923 -1.0334,-0.1023 -2.061,-0.3463 -3.0659,-0.6699 -0.1531,-0.7721 0.006,-1.5103 0.6586,-1.9473 1.7487,-1.6011 4.2126,-2.6857 4.8996,-5.1438 -3.2134,-0.3917 -4.9961,3.1168 -7.92,3.6563 -1.2036,0.2952 -2.1176,-0.6755 -2.7931,-1.5328 4.5817,-7.3864 13.592,-9.7936 19.808,-15.403 1.6804,-1.5045 3.2589,-3.5485 3.0033,-5.9271 -2.7422,-0.3463 -4.7689,1.9644 -7.3635,2.3051 -1.533,-0.051 -1.6124,-1.9304 -1.7543,-3.0717 1.2093,-0.488 3.2134,-1.635 2.3901,-3.1451 -0.931,-0.3519 -1.9131,0 -2.8783,0.097 -0.6416,-0.9651 -1.1696,-2.3335 -0.1364,-3.2247 2.3902,-2.5605 7.2501,-3.696 7.2217,-7.8518 -4.0876,-2.6174 -8.749,-4.3318 -13.58,-4.9165 -6.4666,-0.7213 -12.978,0.2894 -19.235,1.9471 -9.8958,2.3787 -18.866,7.3749 -27.967,11.78 -6.0012,3.134 -12.258,5.7567 -18.179,9.0668 -5.9953,3.3214 -11.906,6.8413 -18.168,9.6686 -3.8719,1.6465 -8.0334,3.3611 -12.337,2.714 -3.5939,-0.6246 -6.1033,-3.5712 -8.1017,-6.3928 -2.7421,-4.0482 -5.2175,-8.3231 -8.6238,-11.872 -7.1707,-7.8632 -16.811,-13.166 -26.996,-16.027 -13.7,-3.8549 -28.137,-3.9629 -42.223,-2.7083 -25.838,2.4528 -50.898,9.5552 -75.844,16.385 -14.352,3.974 -29.051,6.4778 -43.636,9.4301 -11.73,2.3676 -23.221,5.7626 -34.689,9.1576 -23.919,7.1082 -48.059,15.017 -73.221,15.738 -13.28,0.3351 -26.712,-1.8109 -38.941,-7.125 -14.114,6.6595 -29.596,9.6686 -43.869,15.942 -10.083,4.3319 -17.992,12.348 -27.927,16.958 -5.0474,2.4185 -10.639,3.6846 -16.243,3.6392 -1.5726,-0.1135 -2.6455,-1.6862 -2.7875,-3.1567 -0.301,-1.4478 0.2384,-3.1906 -0.9369,-4.3262 -13.211,6.8981 -26.479,13.694 -39.543,20.87 -11.275,6.3871 -21.915,13.949 -33.78,19.28 -4.9279,-0.9481 -5.8986,-6.5062 -8.3171,-10.066 -13.876,7.3918 -25.253,18.633 -39.14,26.019 -9.9979,5.4276 -21.699,8.1869 -33.031,6.2678 -1.8394,-4.3717 -2.5775,-9.2542 -5.3821,-13.177 -3.9969,3.7925 -8.6923,6.7675 -13.512,9.4016 -8.7091,4.6554 -18.196,8.4537 -28.171,8.8965 -5.0697,0.125 -10.702,-1.2887 -13.813,-5.6147 -3.5313,-5.1382 -3.4177,-11.741 -2.657,-17.668 -9.6855,5.6603 -19.314,11.417 -28.994,17.089 -6.597,-3.3893 -14.318,-4.4965 -21.58,-2.8671 -7.2784,1.5101 -14.046,4.7009 -21.018,7.1932 -6.3815,2.3448 -13.024,4.1218 -19.831,4.5703 -1.3397,0.2611 -1.8792,-1.2946 -2.2993,-2.2653 -1.1241,-4.2694 0.051,-8.7772 -1.0842,-13.041 -0.2954,-0.9935 -0.7097,-2.129 -1.7318,-2.5718 -4.6324,0.4485 -9.021103,2.1176 -13.489003,3.3383 -4.8771,1.3739 -10.265,2.1573 -15.102,0.1815 0.9084,-2.7251 2.0609,-5.3594 3.5768,-7.7778 4.5023,-7.3408 11.633,-12.581 19.030003,-16.726 9.345,-5.2175 19.372,-9.0668 28.688,-14.324 31.918,-16.975 64.62,-32.475 95.942,-50.568 8.8285,-5.0471 17.379,-10.577 26.497,-15.096 11.406,-5.9386 23.135,-11.326 33.95,-18.321 4.2299,-2.7196 8.1981,-5.8082 12.212,-8.817 63.099,-47.321 126.67,-94.069 191.96,-138.32 -52.55,8.6126 -104.8,19.082 -156.62,31.316 -47.866,11.377 -95.42,24.129 -142.39,38.782 -24.254,7.6418 -48.695,15.562 -74.129,18.088 -1.8451,0.4713 -3.5995,-1.1696 -4.0934,-2.85 -0.6807,-2.7533 0.3264,-5.4494 0.7198,-8.1582 -0.3279,-0.3196 -0.4683,-0.4564 -0.7964,-0.7761 -13.380003,1.9675 -25.904003,7.2485 -38.541003,11.807 -10.85,3.974 -22.216,7.0399 -33.854,6.9547 -1.7587,-5.6893 -1.4471,-11.952 0.5119,-17.544 z" />
    </svg>
  );
}

// Marks a config field/section whose full split-routing/DNS enforcement is
// specific to korclient (see korclient/README.md): a stock OpenConnect
// client still receives the same values over the standard AnyConnect
// handshake, but only korclient turns them into real policy-routing.
function KorclientHint({ text }: { text: string }) {
  const bubbleId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  // Positioned in JS (not CSS :hover) and rendered position: fixed so the
  // bubble escapes clipping by scrollable modal ancestors (overflow: auto)
  // and stays inside the viewport regardless of which grid column it's in.
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom" } | null>(
    null
  );

  const show = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 10;
    const halfWidth = 140;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, margin + halfWidth),
      window.innerWidth - margin - halfWidth
    );
    const placement: "top" | "bottom" = rect.top > 90 ? "top" : "bottom";
    const top = placement === "top" ? rect.top - 9 : rect.bottom + 9;
    setPos({ top, left, placement });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  return (
    <span
      aria-describedby={bubbleId}
      className="korclient-hint"
      onBlur={hide}
      onFocus={show}
      onMouseEnter={show}
      onMouseLeave={hide}
      ref={triggerRef}
      tabIndex={0}
    >
      <RavenIcon className="korclient-hint-icon" />
      {pos && (
        <span
          className={`korclient-hint-bubble korclient-hint-bubble-${pos.placement}`}
          id={bubbleId}
          role="tooltip"
          style={{ left: pos.left, top: pos.top }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function LastCommandPanel({
  title,
  result,
  onClose
}: {
  title: string;
  result: CommandOutput;
  onClose: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <IconButton label="Close command output" icon={X} onClick={onClose} />
      </div>
      <CommandBlock result={result} />
    </section>
  );
}

function CommandBlock({ result, onClose }: { result: CommandOutput; onClose?: () => void }) {
  if (!result) {
    return <EmptyState text="No command output" />;
  }
  const results = Array.isArray(result) ? result : [result];
  const svgResults = results.filter((item) => isSvgOutput(item.stdout));
  return (
    <div className="command-list">
      {onClose && (
        <div className="command-actions">
          <IconButton label="Close command output" icon={X} onClick={onClose} />
        </div>
      )}
      {svgResults.map((item, index) => (
        <div
          className="qr-preview"
          dangerouslySetInnerHTML={{ __html: item.stdout }}
          key={`svg-${index}`}
        />
      ))}
      <pre>{results.map(formatCommandResult).join("\n\n")}</pre>
    </div>
  );
}

function isSvgOutput(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("<svg") || trimmed.startsWith("<?xml");
}

function formatCommandResult(item: CommandResult): string {
  const stdout = isSvgOutput(item.stdout) ? "[svg output rendered above]" : item.stdout || "";
  if (!stdout && !item.stderr && item.returncode === 0) {
    return `$ ${item.argv.join(" ")}
returncode: 0
dry_run: ${item.dry_run}
output: command completed successfully`;
  }
  return `$ ${item.argv.join(" ")}
returncode: ${item.returncode}
dry_run: ${item.dry_run}

stdout:
${stdout}

stderr:
${item.stderr || ""}`;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

type LogFamily = {
  key: string;
  current: LogFile;
  generations: { gen: number; file: LogFile }[];
};

// Rotated copies share their base name plus a numeric suffix (logrotate
// convention: name.log, name.log.1, name.log.2, ...). Grouping by that base
// name keeps a rotated family to one table row instead of one row per copy.
function groupLogFiles(files: LogFile[]): LogFamily[] {
  const families = new Map<
    string,
    { current: LogFile | null; generations: { gen: number; file: LogFile }[] }
  >();
  for (const file of files) {
    const match = file.name.match(/^(.*)\.(\d+)$/);
    const key = match ? match[1] : file.name;
    const entry = families.get(key) ?? { current: null, generations: [] };
    if (match) {
      entry.generations.push({ gen: Number(match[2]), file });
    } else {
      entry.current = file;
    }
    families.set(key, entry);
  }
  const result: LogFamily[] = [];
  for (const [key, entry] of families) {
    entry.generations.sort((a, b) => a.gen - b.gen);
    // A base file can be absent if rotation deleted it before the current one
    // was recreated; fall back to the oldest generation so the family isn't lost.
    const current = entry.current ?? entry.generations[0]?.file;
    if (!current) {
      continue;
    }
    result.push({
      key,
      current,
      generations: entry.generations.filter(({ file }) => file.name !== current.name)
    });
  }
  result.sort((a, b) => a.key.localeCompare(b.key));
  return result;
}

function formatBytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unit = 0;
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000;
    unit += 1;
  }
  if (unit === 0) {
    return `${Math.round(size)} ${units[unit]}`;
  }
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`;
}

function formatTraffic(value: string | null): string {
  if (!value) {
    return "-";
  }
  const cleaned = value
    .replace(/\b(?:RX|TX)\s*[:=]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const parenthesized = cleaned.match(/\(([^)]+)\)/);
  if (parenthesized) {
    return normalizeByteUnit(parenthesized[1]);
  }
  const bytes = cleaned.match(/^\d+(?:\.\d+)?$/);
  if (bytes) {
    return formatBytes(Number(bytes[0]));
  }
  return normalizeByteUnit(cleaned);
}

function sessionKey(session: SessionRecord): string {
  return `${session.username}:${session.vpn_ip ?? ""}:${session.real_ip ?? ""}`;
}

function parseTrafficBytes(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value
    .replace(/\b(?:RX|TX)\s*[:=]\s*/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kmgtp]?i?b|bytes?)?$/i);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = (match[2] ?? "bytes").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    byte: 1,
    bytes: 1,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4,
    pb: 1000 ** 5,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4,
    pib: 1024 ** 5
  };
  return amount * (multipliers[unit] ?? 1);
}

function rateFromDelta(
  previous: number | null,
  current: number | null,
  elapsedSeconds: number
): string | null {
  if (previous === null || current === null) {
    return null;
  }
  const delta = Math.max(current - previous, 0);
  return `${formatBytes(delta / elapsedSeconds)}/s`;
}

function TrafficValue({ value, rate }: { value: string | null; rate?: string | null }) {
  return (
    <span className="traffic-value">
      <strong>{formatTraffic(value)}</strong>
      {rate ? <small>{formatTrafficRate(rate)}</small> : null}
    </span>
  );
}

function normalizeByteUnit(value: string): string {
  return value
    .replace(/\bKiB\b/g, "KB")
    .replace(/\bMiB\b/g, "MB")
    .replace(/\bGiB\b/g, "GB")
    .replace(/\bTiB\b/g, "TB")
    .trim();
}

function formatTrafficRate(value: string): string {
  const normalized = normalizeByteUnit(value.replace(/\s+/g, " ").trim());
  if (/\b(?:B|KB|MB|GB|TB|PB)\/s\b/i.test(normalized)) {
    return normalized;
  }
  return normalized
    .replace(/\bbytes\/sec\b/i, "B/s")
    .replace(/\bbytes per second\b/i, "B/s")
    .replace(/\bsec\b/i, "s");
}

function formatDuration(seconds: number | null): string {
  if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds < 0) {
    return "-";
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function p12DraftFor(drafts: Record<string, P12Draft>, username: string): P12Draft {
  return drafts[username] ?? { passphrase: "", appleCompatible: false };
}

type UserConfigListKey = "dns" | "nbns" | "split_dns" | "routes" | "no_routes" | "iroutes";
type UserConfigStringKey =
  | "ipv4_network"
  | "ipv4_netmask"
  | "ipv6_network"
  | "explicit_ipv4"
  | "explicit_ipv6"
  | "net_priority"
  | "restrict_user_to_ports"
  | "hostname";
type UserConfigNumberKey =
  | "ipv6_subnet_prefix"
  | "rx_data_per_sec"
  | "tx_data_per_sec"
  | "keepalive"
  | "dpd"
  | "mobile_dpd"
  | "max_same_clients"
  | "stats_report_time"
  | "mtu"
  | "idle_timeout"
  | "mobile_idle_timeout"
  | "session_timeout";
type UserConfigBoolKey =
  | "deny_roaming"
  | "no_udp"
  | "tunnel_all_dns"
  | "restrict_user_to_routes";

function normalizeUserConfigDraft(draft: UserConfig): UserConfig {
  return {
    ...draft,
    dns: cleanList(draft.dns),
    nbns: cleanList(draft.nbns),
    split_dns: cleanList(draft.split_dns),
    routes: cleanList(draft.routes),
    no_routes: cleanList(draft.no_routes),
    iroutes: cleanList(draft.iroutes),
    ipv4_network: cleanOptional(draft.ipv4_network),
    ipv4_netmask: cleanOptional(draft.ipv4_netmask),
    ipv6_network: cleanOptional(draft.ipv6_network),
    explicit_ipv4: cleanOptional(draft.explicit_ipv4),
    explicit_ipv6: cleanOptional(draft.explicit_ipv6),
    net_priority: cleanOptional(draft.net_priority),
    restrict_user_to_ports: cleanOptional(draft.restrict_user_to_ports),
    hostname: cleanOptional(draft.hostname)
  };
}

function cleanList(value: string[]): string[] {
  return value.map((item) => item.trim()).filter(Boolean);
}

function cleanOptional(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function listText(value: string[]): string {
  return value.join("\n");
}

function nullableNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableBoolean(value: string): boolean | null {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function diagnosticKind(result: CommandResult): "ok" | "warning" | "error" {
  if (result.returncode !== 0) {
    return "error";
  }
  const text = `${result.stdout} ${result.stderr}`.toLowerCase();
  if (text.includes("not installed yet") || text.includes("not ready")) {
    return "warning";
  }
  return "ok";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "operation failed";
}

function isAuthError(text: string): boolean {
  return (
    text.includes("authentication required") ||
    text.includes("invalid credentials") ||
    text.includes("admin password is not configured") ||
    text.includes("401")
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
