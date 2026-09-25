import { LogOut, Menu, Moon, RefreshCw, Sun } from "lucide-react";
import { type FormEvent, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AuthInfo, type CommandResult, type GroupPolicyDraft, type InterfaceStats, type IntervalUnit, type LogRotationSettings, type LogTail, type OidcProviderDraft, type SessionRecord, type UpstreamProfileDraft, applyNft, changePassword, connectUpstreamProfile, createCertificate, createP12, createUser, deleteGroup, deleteGroupConfig, deleteGroupPolicy, deleteOidcProvider, deleteUpstreamProfile, deleteUser, deleteUserConfig, disconnectUpstreamProfile, fetchAuthInfo, fetchCertificateStatus, fetchConfig, fetchConfigDiff, fetchConfigSource, fetchDiagnostics, fetchDomains, fetchDomainsStatus, fetchGroupConfig, fetchGroups, fetchHealth, fetchHostDomains, fetchHostDomainsStatus, fetchHostRoutes, fetchHostRoutesStatus, fetchIdentity, fetchInterfaceStats, fetchInternalDnsStatus, fetchLog, fetchLogFiles, fetchLogRotationSettings, fetchOtpQr, fetchOtpRecords, fetchP12, fetchRenderedConfig, fetchRevokedCertificates, fetchRoutes, fetchRoutesStatus, fetchServerProcesses, fetchServerStatus, fetchSessions, fetchSoftwareVersions, fetchUpstreamProfiles, fetchUpstreamStatus, fetchUserCert, fetchUserConfig, fetchUserKey, fetchUsers, issueLetsEncryptCertificate, kickSession, login, logout as logoutSession, refreshDomainsUrl, refreshHostDomainsUrl, refreshHostRoutesUrl, refreshInternalDnsBlocklist, refreshRoutesUrl, regenerateCa, reloadServer, renewLetsEncryptCertificate, restartServer, revokeCaCertificateB64, revokeCaCertificateFile, revokeCertificate, runLogRotation, saveAuthMethodsSettings, saveCertificateSettings, saveConfigSource, saveGeneralSettings, saveGroupConfig, saveGroupPolicy, saveIdentitySettings, saveInternalDnsSettings, saveLetsEncryptSettings, saveLogRotationSettings, saveOidcProvider, saveOidcSettings, saveRoutingSettings, saveServerSettings, saveUpstreamProfile, saveUpstreamSettings, saveUserConfig, saveUserGroups, saveWebSettings, setCsrfToken, setDomains, setHostDomains, setHostRoutes, setOtp, setRoutes, setUpstreamProfileEnabled, setUserEnabled, startServer, stopServer, switchUpstream, testOtpEmail, testOtpTelegram, uploadCa, uploadExternalCertificates, validateConfigSource, writeRenderedConfig } from "./api";
import { emptyState, emptyUpstreamProfileDraft, emptyUserConfig, tabs, themeStorageKey, upstreamProfileToDraft } from "./app/state";
import { type AppState, type CommandOutput, type CommandOutputKey, type ConfigSection, type GroupConfigModalState, type GroupMembersModalState, INTERFACE_HISTORY_CAP, type InterfaceRatePoint, type InterfaceSample, type Notice, type OidcDraft, type P12Base64ModalState, type P12Draft, type RevokedCertsModalState, type SessionRates, type SessionSample, type Tab, type Theme, type UserConfigModalState, type UserGroupsModalState } from "./app/types";
import { NoticeToast } from "./components/NoticeToast";
import { IconButton, RavenMark } from "./components/ui";
import { confirmAction, delay, settledValue } from "./lib/async";
import { type AuthMethodsDraft, type GeneralSettingsDraft, type ServerSettingsDraft, type WebSettingsDraft, authMethodsPayload, readAuthMethodsDraft, readGeneralSettingsDraft, readOidcDraft, readRoutingDraft, readServerSettingsDraft, readWebSettingsDraft, splitLines } from "./lib/drafts";
import { diagnosticKind, errorMessage, isAuthError } from "./lib/errors";
import { blobToBase64, saveBlob } from "./lib/files";
import { parseTrafficBytes, rateFromDelta, sessionKey } from "./lib/format";
import { readBoolean, readNumber, readRecord } from "./lib/read";
import { serverRuntimeState } from "./lib/serverStatus";
import { normalizeUserConfigDraft, p12DraftFor } from "./lib/userConfig";
import { DashboardView } from "./views/DashboardView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { IdentityView } from "./views/IdentityView";
import { type InternalDnsDraft, InternalDnsView } from "./views/InternalDnsView";
import { LoginScreen } from "./views/LoginScreen";
import { LogsView } from "./views/LogsView";
import { SessionsView } from "./views/SessionsView";
import { CertificatesView } from "./views/certificates/CertificatesView";
import { ConfigSubnav } from "./views/config/ConfigSubnav";
import { ConfigView } from "./views/config/ConfigView";
import { GroupMembersDialog } from "./views/groups/GroupMembersDialog";
import { GroupsView } from "./views/groups/GroupsView";
import { UserConfigDialog } from "./views/groups/UserConfigDialog";
import { UpstreamProfileDialog } from "./views/upstream/UpstreamProfileDialog";
import { UpstreamSettingsDialog } from "./views/upstream/UpstreamSettingsDialog";
import { UpstreamView } from "./views/upstream/UpstreamView";
import { P12Base64Dialog } from "./views/users/P12Base64Dialog";
import { RevokedCertsDialog } from "./views/users/RevokedCertsDialog";
import { UserGroupsDialog } from "./views/users/UserGroupsDialog";
import { UsersView } from "./views/users/UsersView";

const TerminalView = lazy(() =>
  import("./TerminalView").then((module) => ({ default: module.TerminalView }))
);

export function App() {
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
    clientTraffic: true,
    mode: "full",
    tunnelDns: false,
    hostTraffic: false,
    hostMode: "full",
    mainInterface: "auto",
    fwmark: "0x0c01",
    tableId: 1201,
    nftPrefix: "korserver",
    routesFilesText: "",
    routesUrlsText: "",
    domainsFilesText: "",
    domainsUrlsText: "",
    hostRoutesFilesText: "",
    hostRoutesUrlsText: "",
    hostDomainsFilesText: "",
    hostDomainsUrlsText: ""
  });
  const [internalDnsDraft, setInternalDnsDraft] = useState<InternalDnsDraft>({
    enabled: false,
    listen: "10.10.10.1",
    port: 53,
    blocklistEnabled: false,
    localRecordsEnabled: false,
    publicUpstreamsText: "",
    publicDomainsText: "",
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
  const [upstreamCheckSettleSeconds, setUpstreamCheckSettleSeconds] = useState(15);
  const [upstreamFailover, setUpstreamFailover] = useState(false);
  const [upstreamConnectOnBoot, setUpstreamConnectOnBoot] = useState(true);
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
            fetchRoutesStatus(token),
            fetchDomainsStatus(token),
            fetchHostRoutes(token),
            fetchHostDomains(token),
            fetchHostRoutesStatus(token),
            fetchHostDomainsStatus(token),
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
          routesStatus,
          domainsStatus,
          hostRoutes,
          hostDomains,
          hostRoutesStatus,
          hostDomainsStatus,
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
          routesStatus: settledValue(routesStatus, current.routesStatus),
          domainsStatus: settledValue(domainsStatus, current.domainsStatus),
          hostRoutes: settledValue(hostRoutes, current.hostRoutes),
          hostDomains: settledValue(hostDomains, current.hostDomains),
          hostRoutesStatus: settledValue(hostRoutesStatus, current.hostRoutesStatus),
          hostDomainsStatus: settledValue(hostDomainsStatus, current.hostDomainsStatus),
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
          setUpstreamCheckSettleSeconds(readNumber(upstreamConfig.check_settle_seconds, 15));
          setUpstreamFailover(readBoolean(upstreamConfig.failover, false));
          setUpstreamConnectOnBoot(readBoolean(upstreamConfig.connect_on_boot, true));
          setServerSettingsDraft(readServerSettingsDraft(config.value));
          setAuthMethodsDraft(readAuthMethodsDraft(config.value));
          setWebSettingsDraft(readWebSettingsDraft(config.value));
          setGeneralSettingsDraft(readGeneralSettingsDraft(config.value));
        }
        if (internalDns.status === "fulfilled") {
          setInternalDnsDraft({
            enabled: internalDns.value.enabled,
            listen: internalDns.value.listen,
            port: internalDns.value.port,
            blocklistEnabled:
              internalDns.value.blocklist_enabled ??
              (internalDns.value.blocklist_domains.length > 0 ||
                internalDns.value.blocklist_files.length > 0 ||
                internalDns.value.blocklist_urls.length > 0),
            localRecordsEnabled:
              internalDns.value.local_records_enabled ?? internalDns.value.local_records.length > 0,
            publicUpstreamsText: internalDns.value.public_upstreams.join("\n"),
            publicDomainsText: internalDns.value.public_domains.join("\n"),
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
        client_traffic: routingDraft.clientTraffic,
        mode: routingDraft.mode,
        tunnel_dns: routingDraft.tunnelDns,
        host_traffic: routingDraft.hostTraffic,
        host_mode: routingDraft.hostMode,
        main_interface: routingDraft.mainInterface,
        fwmark: routingDraft.fwmark,
        table_id: routingDraft.tableId,
        nft_prefix: routingDraft.nftPrefix,
        routes_files: splitLines(routingDraft.routesFilesText),
        routes_urls: splitLines(routingDraft.routesUrlsText),
        domains_files: splitLines(routingDraft.domainsFilesText),
        domains_urls: splitLines(routingDraft.domainsUrlsText),
        host_routes_files: splitLines(routingDraft.hostRoutesFilesText),
        host_routes_urls: splitLines(routingDraft.hostRoutesUrlsText),
        host_domains_files: splitLines(routingDraft.hostDomainsFilesText),
        host_domains_urls: splitLines(routingDraft.hostDomainsUrlsText)
      })
    );
    if (result !== null) {
      recordCommand("routing", syntheticCommand(["korctl", "routing", "settings"], "saved"));
    }
  };

  const handleSaveHostRoutes = async (items: string[]) => {
    const result = await runAction("save-host-routes", "Host routes saved", (token) =>
      setHostRoutes(token, items)
    );
    if (result !== null) {
      recordCommand(
        "routing",
        syntheticCommand(["korctl", "host-routes", "set", ...items], "saved")
      );
    }
  };

  const handleSaveHostDomains = async (items: string[]) => {
    const result = await runAction("save-host-domains", "Host domains saved", (token) =>
      setHostDomains(token, items)
    );
    if (result !== null) {
      recordCommand(
        "routing",
        syntheticCommand(["korctl", "host-domains", "set", ...items], "saved")
      );
    }
  };

  const handleRefreshRoutesUrl = async (url: string, preview: boolean) => {
    const result = await runAction(
      preview ? `routes-preview-${url}` : `routes-refresh-${url}`,
      preview ? "Route URL validated" : "Route list downloaded and applied",
      (token) => refreshRoutesUrl(token, url, preview)
    );
    if (result !== null) {
      const argv = ["korctl", "routes", "refresh", "--url", url];
      if (preview) argv.push("--preview");
      const sample = result.sample.length
        ? `sample:\n  ${result.sample.join("\n  ")}`
        : "sample: (empty)";
      recordCommand(
        "routing",
        syntheticCommand(
          argv,
          [`url: ${result.url}`, `valid: ${result.valid}`, `skipped: ${result.skipped}`, sample].join(
            "\n"
          )
        )
      );
    }
  };

  const handleRefreshDomainsUrl = async (url: string, preview: boolean) => {
    const result = await runAction(
      preview ? `domains-preview-${url}` : `domains-refresh-${url}`,
      preview ? "Domain URL validated" : "Domain list downloaded and applied",
      (token) => refreshDomainsUrl(token, url, preview)
    );
    if (result !== null) {
      const argv = ["korctl", "domains", "refresh", "--url", url];
      if (preview) argv.push("--preview");
      const sample = result.sample.length
        ? `sample:\n  ${result.sample.join("\n  ")}`
        : "sample: (empty)";
      recordCommand(
        "routing",
        syntheticCommand(
          argv,
          [`url: ${result.url}`, `valid: ${result.valid}`, `skipped: ${result.skipped}`, sample].join(
            "\n"
          )
        )
      );
    }
  };

  const handleRefreshHostRoutesUrl = async (url: string, preview: boolean) => {
    const result = await runAction(
      preview ? `host-routes-preview-${url}` : `host-routes-refresh-${url}`,
      preview ? "Host route URL validated" : "Host route list downloaded and applied",
      (token) => refreshHostRoutesUrl(token, url, preview)
    );
    if (result !== null) {
      const argv = ["korctl", "host-routes", "refresh", "--url", url];
      if (preview) argv.push("--preview");
      const sample = result.sample.length
        ? `sample:\n  ${result.sample.join("\n  ")}`
        : "sample: (empty)";
      recordCommand(
        "routing",
        syntheticCommand(
          argv,
          [`url: ${result.url}`, `valid: ${result.valid}`, `skipped: ${result.skipped}`, sample].join(
            "\n"
          )
        )
      );
    }
  };

  const handleRefreshHostDomainsUrl = async (url: string, preview: boolean) => {
    const result = await runAction(
      preview ? `host-domains-preview-${url}` : `host-domains-refresh-${url}`,
      preview ? "Host domain URL validated" : "Host domain list downloaded and applied",
      (token) => refreshHostDomainsUrl(token, url, preview)
    );
    if (result !== null) {
      const argv = ["korctl", "host-domains", "refresh", "--url", url];
      if (preview) argv.push("--preview");
      const sample = result.sample.length
        ? `sample:\n  ${result.sample.join("\n  ")}`
        : "sample: (empty)";
      recordCommand(
        "routing",
        syntheticCommand(
          argv,
          [`url: ${result.url}`, `valid: ${result.valid}`, `skipped: ${result.skipped}`, sample].join(
            "\n"
          )
        )
      );
    }
  };

  const handleSaveInternalDnsSettings = async () => {
    const result = await runAction(
      "internal-dns-settings",
      "DNS settings saved and applied",
      (token) =>
        saveInternalDnsSettings(token, {
          resolver_enabled: internalDnsDraft.enabled,
          listen: internalDnsDraft.listen,
          port: internalDnsDraft.port,
          blocklist_enabled: internalDnsDraft.blocklistEnabled,
          local_records_enabled: internalDnsDraft.localRecordsEnabled,
          server_dns: splitLines(serverSettingsDraft.dns),
          search_domains: splitLines(serverSettingsDraft.searchDomains),
          tunnel_dns: routingDraft.tunnelDns,
          public_upstreams: splitLines(internalDnsDraft.publicUpstreamsText),
          public_domains: splitLines(internalDnsDraft.publicDomainsText),
          blocklist_domains: splitLines(internalDnsDraft.domainsText),
          blocklist_files: splitLines(internalDnsDraft.filesText),
          blocklist_urls: splitLines(internalDnsDraft.urlsText),
          cache_size: internalDnsDraft.cacheSize,
          log_queries: internalDnsDraft.logQueries,
          local_records: splitLines(internalDnsDraft.localRecordsText)
        }),
      { reload: false }
    );
    if (result !== null) {
      recordCommand("internal_dns", result.commands);
      setNotice({
        kind: result.reconnect_required ? "warning" : "ok",
        text: result.reconnect_required
          ? "DNS settings applied; client-facing DNS changed, so active VPN clients are reconnecting"
          : "DNS settings applied without disconnecting VPN clients"
      });
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
      (token) => saveAuthMethodsSettings(token, authMethodsPayload(authMethodsDraft))
    );
    if (result !== null) {
      recordCommand("config", syntheticCommand(["korctl", "server", "auth-settings"], "saved"));
    }
  };

  const handleTestOtpEmail = async () => {
    await runAction(
      "auth-methods-test-email",
      "Test email sent",
      (token) => testOtpEmail(token, authMethodsPayload(authMethodsDraft)),
      { reload: false }
    );
  };

  const handleTestOtpTelegram = async () => {
    await runAction(
      "auth-methods-test-telegram",
      "Test Telegram message sent",
      (token) => testOtpTelegram(token, authMethodsPayload(authMethodsDraft)),
      { reload: false }
    );
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
          check_settle_seconds: upstreamCheckSettleSeconds,
          failover: upstreamFailover,
          connect_on_boot: upstreamConnectOnBoot
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
      ...upstreamProfileToDraft(active, Boolean(state.upstream?.enabled)),
      check_host: upstreamCheckHost
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
              label="Reload panel data"
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
            onOpenGroups={async (username) => {
              // Fetch fresh for the same reason as GroupsView's onOpenMembers
              // below: state.users only updates after actions taken through
              // this panel, so a stale tab or an out-of-band change (CLI,
              // another admin session) would otherwise show wrong here.
              await runAction(
                `user-groups-load-${username}`,
                `Loaded groups for ${username}`,
                async (token) => {
                  const users = await fetchUsers(token);
                  setState((current) => ({ ...current, users }));
                  const user = users.find((item) => item.username === username);
                  setUserGroupsModal({ username, groups: user?.groups ?? [] });
                  return { status: "ok" };
                },
                { reload: false }
              );
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
            onOpenMembers={async (name) => {
              // Fetch fresh rather than trusting the in-memory state.users
              // snapshot: it only ever updates after an action taken through
              // this panel, so membership changed via the CLI, another admin
              // session, or just a stale tab would otherwise show here as
              // wrong until some unrelated reload happened to refresh it.
              await runAction(
                `group-members-load-${name}`,
                `Loaded members for ${name}`,
                async (token) => {
                  const users = await fetchUsers(token);
                  setState((current) => ({ ...current, users }));
                  setGroupMembersModal({
                    name,
                    users: users
                      .filter((user) => (user.groups ?? []).includes(name))
                      .map((user) => user.username)
                  });
                  return { status: "ok" };
                },
                { reload: false }
              );
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
            serverDraft={serverSettingsDraft}
            resolverRequired={
              (routingDraft.mode === "split" && routingDraft.tunnelDns) ||
              state.upstreamProfiles.some(
                (profile) => profile.enabled && (profile.domains?.length ?? 0) > 0
              )
            }
            busy={busy}
            commandOutput={commandOutputs.internal_dns ?? null}
            onClearCommand={() => clearCommand("internal_dns")}
            onDraftChange={setInternalDnsDraft}
            onDnsServerDraftChange={setRoutingDraft}
            onServerDraftChange={setServerSettingsDraft}
            onSave={() => void handleSaveInternalDnsSettings()}
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
              onSwitch={(profile) => {
                const current = state.upstream?.active_profile;
                if (
                  current &&
                  current !== profile &&
                  !confirmAction(
                    `Make "${profile}" the default profile? Client/host traffic currently ` +
                      `redirected via "${current}" will re-point to "${profile}" -- ` +
                      "existing connections stay up."
                  )
                ) {
                  return;
                }
                void runAction(`switch-${profile}`, `Upstream profile ${profile} selected`, (token) =>
                  switchUpstream(token, profile)
                );
              }}
              onDeleteProfile={(profile) => void handleDeleteUpstreamProfile(profile)}
              onCreateProfile={() => {
                setUpstreamDraft(emptyUpstreamProfileDraft);
                setEditingUpstreamProfile(false);
                setUpstreamDialogKey((key) => key + 1);
                setUpstreamModalOpen(true);
              }}
              onEditProfile={(profile) => {
                setUpstreamDraft(
                  upstreamProfileToDraft(profile, Boolean(state.upstream?.enabled))
                );
                setEditingUpstreamProfile(true);
                setUpstreamDialogKey((key) => key + 1);
                setUpstreamModalOpen(true);
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
            checkSettleSeconds={upstreamCheckSettleSeconds}
            failover={upstreamFailover}
            connectOnBoot={upstreamConnectOnBoot}
            checkHost={upstreamCheckHost}
            hasActiveProfile={Boolean(state.upstream?.active_profile)}
            upstreamEnabled={Boolean(state.upstream?.enabled)}
            routes={state.routes}
            domains={state.domains}
            routesStatus={state.routesStatus}
            domainsStatus={state.domainsStatus}
            hostRoutes={state.hostRoutes}
            hostDomains={state.hostDomains}
            hostRoutesStatus={state.hostRoutesStatus}
            hostDomainsStatus={state.hostDomainsStatus}
            routingDraft={routingDraft}
            busy={busy}
            onInterfaceChange={setUpstreamInterface}
            onCheckIntervalChange={setUpstreamCheckInterval}
            onCheckThresholdChange={setUpstreamCheckThreshold}
            onCheckSettleSecondsChange={setUpstreamCheckSettleSeconds}
            onFailoverChange={setUpstreamFailover}
            onConnectOnBootChange={setUpstreamConnectOnBoot}
            onCheckHostChange={setUpstreamCheckHost}
            onRoutingDraftChange={setRoutingDraft}
            onSaveRoutes={(items) => void handleSaveRoutes(items)}
            onSaveDomains={(items) => void handleSaveDomains(items)}
            onPreviewRoutesUrl={(url) => void handleRefreshRoutesUrl(url, true)}
            onRefreshRoutesUrl={(url) => void handleRefreshRoutesUrl(url, false)}
            onPreviewDomainsUrl={(url) => void handleRefreshDomainsUrl(url, true)}
            onRefreshDomainsUrl={(url) => void handleRefreshDomainsUrl(url, false)}
            onSaveHostRoutes={(items) => void handleSaveHostRoutes(items)}
            onSaveHostDomains={(items) => void handleSaveHostDomains(items)}
            onPreviewHostRoutesUrl={(url) => void handleRefreshHostRoutesUrl(url, true)}
            onRefreshHostRoutesUrl={(url) => void handleRefreshHostRoutesUrl(url, false)}
            onPreviewHostDomainsUrl={(url) => void handleRefreshHostDomainsUrl(url, true)}
            onRefreshHostDomainsUrl={(url) => void handleRefreshHostDomainsUrl(url, false)}
            onClose={() => setUpstreamSettingsModalOpen(false)}
            onSave={async (event) => {
              event.preventDefault();
              await handleSaveUpstreamSettings(Boolean(state.upstream?.enabled));
              await handleSaveUpstreamCheckHost();
              await handleSaveRoutingSettings();
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
            onTestOtpEmail={() => void handleTestOtpEmail()}
            onTestOtpTelegram={() => void handleTestOtpTelegram()}
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
