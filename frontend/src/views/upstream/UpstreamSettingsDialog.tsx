import { Save, X } from "lucide-react";
import type { FormEvent } from "react";
import { BulkListEditor } from "../../components/BulkListEditor";
import { SettingsTabs } from "../../components/SettingsTabs";
import { IconButton } from "../../components/ui";
import { type RoutingDraft, RoutingListSourcesPanel } from "./RoutingListSourcesPanel";
import type { RoutingListStatus } from "../../api";

export function UpstreamSettingsDialog({
  upstreamInterface,
  checkInterval,
  checkThreshold,
  checkSettleSeconds,
  failover,
  connectOnBoot,
  checkHost,
  hasActiveProfile,
  upstreamEnabled,
  routes,
  domains,
  routesStatus,
  domainsStatus,
  hostRoutes,
  hostDomains,
  hostRoutesStatus,
  hostDomainsStatus,
  routingDraft,
  busy,
  onInterfaceChange,
  onCheckIntervalChange,
  onCheckThresholdChange,
  onCheckSettleSecondsChange,
  onFailoverChange,
  onConnectOnBootChange,
  onCheckHostChange,
  onRoutingDraftChange,
  onSaveRoutes,
  onSaveDomains,
  onPreviewRoutesUrl,
  onRefreshRoutesUrl,
  onPreviewDomainsUrl,
  onRefreshDomainsUrl,
  onSaveHostRoutes,
  onSaveHostDomains,
  onPreviewHostRoutesUrl,
  onRefreshHostRoutesUrl,
  onPreviewHostDomainsUrl,
  onRefreshHostDomainsUrl,
  onClose,
  onSave
}: {
  upstreamInterface: string;
  checkInterval: number;
  checkThreshold: number;
  checkSettleSeconds: number;
  failover: boolean;
  connectOnBoot: boolean;
  checkHost: string;
  hasActiveProfile: boolean;
  upstreamEnabled: boolean;
  routes: string[];
  domains: string[];
  routesStatus: RoutingListStatus | null;
  domainsStatus: RoutingListStatus | null;
  hostRoutes: string[];
  hostDomains: string[];
  hostRoutesStatus: RoutingListStatus | null;
  hostDomainsStatus: RoutingListStatus | null;
  routingDraft: RoutingDraft;
  busy: string | null;
  onInterfaceChange: (value: string) => void;
  onCheckIntervalChange: (value: number) => void;
  onCheckThresholdChange: (value: number) => void;
  onCheckSettleSecondsChange: (value: number) => void;
  onFailoverChange: (value: boolean) => void;
  onConnectOnBootChange: (value: boolean) => void;
  onCheckHostChange: (value: string) => void;
  onRoutingDraftChange: (value: RoutingDraft) => void;
  onSaveRoutes: (items: string[]) => void;
  onSaveDomains: (items: string[]) => void;
  onPreviewRoutesUrl: (url: string) => void;
  onRefreshRoutesUrl: (url: string) => void;
  onPreviewDomainsUrl: (url: string) => void;
  onRefreshDomainsUrl: (url: string) => void;
  onSaveHostRoutes: (items: string[]) => void;
  onSaveHostDomains: (items: string[]) => void;
  onPreviewHostRoutesUrl: (url: string) => void;
  onRefreshHostRoutesUrl: (url: string) => void;
  onPreviewHostDomainsUrl: (url: string) => void;
  onRefreshHostDomainsUrl: (url: string) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const splitEnabled = routingDraft.mode === "split";
  const splitDnsEnabled = splitEnabled && routingDraft.tunnelDns;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" role="dialog" aria-modal="true">
        <div className="panel-header">
          <h2>Upstream settings</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        <form className="upstream-settings-form" onSubmit={onSave}>
          <SettingsTabs ariaLabel="Upstream settings">
          <details className="settings-details upstream-settings-section">
            <summary>Connection &amp; health</summary>
            <div className="settings-grid settings-details-body">
              <label>
                <span>Interface</span>
                <input
                  value={upstreamInterface}
                  onChange={(event) => onInterfaceChange(event.target.value)}
                />
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
                  onChange={(event) =>
                    onCheckIntervalChange(Math.max(1, Number(event.target.value) || 5))
                  }
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
              <label title="Grace window after a successful reconnect during which health-check failures aren't counted yet, so a still-settling tunnel can't immediately trigger another reconnect">
                <span>Check settle (s)</span>
                <input
                  type="number"
                  value={checkSettleSeconds}
                  onChange={(event) =>
                    onCheckSettleSecondsChange(Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label
                className="switch"
                title="When health checks fail, try the other configured profiles in turn (after reconnecting the active one first)"
              >
                <input
                  checked={failover}
                  onChange={(event) => onFailoverChange(event.target.checked)}
                  type="checkbox"
                />
                <span>Failover</span>
              </label>
              <label
                className="switch"
                title="Whether the watchdog dials the selected profile on its own the first time it sees it down after the server/container starts. Off leaves upstream disconnected after a restart until an admin connects it manually -- once any connection succeeds, normal reconnect-on-failure resumes regardless of this flag."
              >
                <input
                  checked={connectOnBoot}
                  onChange={(event) => onConnectOnBootChange(event.target.checked)}
                  type="checkbox"
                />
                <span>Connect on boot</span>
              </label>
            </div>
          </details>

          <details className="settings-details upstream-settings-section">
            <summary>Server host</summary>
            <p className="muted-line">
              Independent of what clients get below -- does the server itself (not VPN
              clients) send its own outbound traffic through Upstream too?
              {!upstreamEnabled && " Inert until Upstream is enabled."}
            </p>
            <label className="switch">
              <input
                checked={routingDraft.hostTraffic}
                disabled={!upstreamEnabled}
                onChange={(event) =>
                  onRoutingDraftChange({ ...routingDraft, hostTraffic: event.target.checked })
                }
                type="checkbox"
              />
              <span>Route this host&rsquo;s own traffic through Upstream</span>
            </label>
            {routingDraft.hostTraffic && (
              <label
                title={
                  routingDraft.hostMode === "full"
                    ? "Caution: matches ALL host-originated traffic, which can also capture the outbound Upstream connection itself and cause a routing loop unless your network already routes that address another way. Prefer Split with a curated route list when precision matters."
                    : undefined
                }
              >
                <span>Host mode</span>
                <select
                  disabled={!upstreamEnabled}
                  value={routingDraft.hostMode}
                  onChange={(event) =>
                    onRoutingDraftChange({ ...routingDraft, hostMode: event.target.value })
                  }
                >
                  <option value="full">Full (all host traffic)</option>
                  <option value="split">Split (only the routes/domains below)</option>
                </select>
              </label>
            )}
            {routingDraft.hostTraffic && routingDraft.hostMode === "split" && (
              <div className="routing-substep">
                <p className="muted-line">
                  Own list, separate from the client&rsquo;s below -- the host follows these
                  routes/domains, not the client&rsquo;s.
                </p>
                <section className="split">
                  <BulkListEditor
                    title="Host routes"
                    items={hostRoutes}
                    placeholder={"10.30.0.0/16\n203.0.113.9"}
                    busy={busy === "save-host-routes"}
                    disabled={!upstreamEnabled}
                    onSave={onSaveHostRoutes}
                  />
                  <BulkListEditor
                    title="Host domains"
                    items={hostDomains}
                    placeholder={"intranet.example\ncorp-internal.example.com"}
                    busy={busy === "save-host-domains"}
                    disabled={!upstreamEnabled}
                    onSave={onSaveHostDomains}
                  />
                </section>
                <section className="split">
                  <RoutingListSourcesPanel
                    title="Host route sources"
                    filesLabel="Host route files (one path per line)"
                    filesPlaceholder={"/var/lib/korserver/extra-host-routes.txt"}
                    urlsLabel="Host route URLs (one per line)"
                    urlsPlaceholder={"https://lists.example.com/host-routes.txt"}
                    disabled={!upstreamEnabled}
                    filesText={routingDraft.hostRoutesFilesText}
                    urlsText={routingDraft.hostRoutesUrlsText}
                    status={hostRoutesStatus}
                    busy={busy}
                    busyKeyPrefix="host-routes"
                    onFilesTextChange={(value) =>
                      onRoutingDraftChange({ ...routingDraft, hostRoutesFilesText: value })
                    }
                    onUrlsTextChange={(value) =>
                      onRoutingDraftChange({ ...routingDraft, hostRoutesUrlsText: value })
                    }
                    onPreviewUrl={onPreviewHostRoutesUrl}
                    onRefreshUrl={onRefreshHostRoutesUrl}
                  />
                  <RoutingListSourcesPanel
                    title="Host domain sources"
                    filesLabel="Host domain files (one path per line)"
                    filesPlaceholder={"/var/lib/korserver/extra-host-domains.txt"}
                    urlsLabel="Host domain URLs (one per line)"
                    urlsPlaceholder={"https://lists.example.com/host-domains.txt"}
                    disabled={!upstreamEnabled}
                    filesText={routingDraft.hostDomainsFilesText}
                    urlsText={routingDraft.hostDomainsUrlsText}
                    status={hostDomainsStatus}
                    busy={busy}
                    busyKeyPrefix="host-domains"
                    onFilesTextChange={(value) =>
                      onRoutingDraftChange({ ...routingDraft, hostDomainsFilesText: value })
                    }
                    onUrlsTextChange={(value) =>
                      onRoutingDraftChange({ ...routingDraft, hostDomainsUrlsText: value })
                    }
                    onPreviewUrl={onPreviewHostDomainsUrl}
                    onRefreshUrl={onRefreshHostDomainsUrl}
                  />
                </section>
                <p className="muted-line">
                  Host route/domain sources are saved together with the rest of this dialog
                  (Save settings below) -- fill these in, click Save, then validate/download
                  each URL.
                </p>
              </div>
            )}
          </details>

          <details className="settings-details upstream-settings-section">
            <summary>VPN clients</summary>
            <p className="muted-line">
              What happens to a connected client&rsquo;s traffic once it leaves ocserv, when
              no profile claims it specifically (a profile&rsquo;s own client/host routing
              toggles, in its edit dialog, always win over this).
              {!upstreamEnabled && " Inert until Upstream is enabled."}
            </p>
            <label className="switch">
              <input
                checked={routingDraft.clientTraffic}
                disabled={!upstreamEnabled}
                onChange={(event) =>
                  onRoutingDraftChange({ ...routingDraft, clientTraffic: event.target.checked })
                }
                type="checkbox"
              />
              <span>Route a client&rsquo;s traffic through Upstream by default</span>
            </label>
            {routingDraft.clientTraffic && (
              <label>
                <span>Mode</span>
                <select
                  disabled={!upstreamEnabled}
                  value={routingDraft.mode}
                  onChange={(event) =>
                    onRoutingDraftChange({ ...routingDraft, mode: event.target.value })
                  }
                >
                  <option value="full">Full (all traffic via Upstream)</option>
                  <option value="split">Split (only listed traffic via Upstream)</option>
                </select>
              </label>
            )}
            {routingDraft.clientTraffic && splitEnabled && (
              <div className="routing-substep">
                <label
                  className="switch"
                  title="Push this server's dnsmasq as the DNS for VPN clients and resolve the Domains list below into the split set. Distinct from the per-user/group 'Split DNS' setting. The dnsmasq listen address/port are configured in Config → DNS."
                >
                  <input
                    checked={routingDraft.tunnelDns}
                    disabled={!upstreamEnabled}
                    onChange={(event) =>
                      onRoutingDraftChange({ ...routingDraft, tunnelDns: event.target.checked })
                    }
                    type="checkbox"
                  />
                  <span>Also split by domain (needs this server&rsquo;s own DNS)</span>
                </label>
                <section className="split">
                  <BulkListEditor
                    title="Routes"
                    items={routes}
                    placeholder={"10.20.0.0/16\n203.0.113.5"}
                    busy={busy === "save-routes"}
                    disabled={!upstreamEnabled}
                    onSave={onSaveRoutes}
                  />
                  {splitDnsEnabled && (
                    <BulkListEditor
                      title="Domains"
                      items={domains}
                      placeholder={"internal.example\ncorp.example.com"}
                      busy={busy === "save-domains"}
                      disabled={!upstreamEnabled}
                      onSave={onSaveDomains}
                    />
                  )}
                </section>
                <section className="split">
                  <RoutingListSourcesPanel
                    title="Route sources"
                    filesLabel="Route files (one path per line)"
                    filesPlaceholder={"/var/lib/korserver/extra-routes.txt"}
                    urlsLabel="Route URLs (one per line)"
                    urlsPlaceholder={"https://lists.example.com/routes.txt"}
                    disabled={!upstreamEnabled}
                    filesText={routingDraft.routesFilesText}
                    urlsText={routingDraft.routesUrlsText}
                    status={routesStatus}
                    busy={busy}
                    busyKeyPrefix="routes"
                    onFilesTextChange={(value) =>
                      onRoutingDraftChange({ ...routingDraft, routesFilesText: value })
                    }
                    onUrlsTextChange={(value) =>
                      onRoutingDraftChange({ ...routingDraft, routesUrlsText: value })
                    }
                    onPreviewUrl={onPreviewRoutesUrl}
                    onRefreshUrl={onRefreshRoutesUrl}
                  />
                  {splitDnsEnabled && (
                    <RoutingListSourcesPanel
                      title="Domain sources"
                      filesLabel="Domain files (one path per line)"
                      filesPlaceholder={"/var/lib/korserver/extra-domains.txt"}
                      urlsLabel="Domain URLs (one per line)"
                      urlsPlaceholder={"https://lists.example.com/domains.txt"}
                      disabled={!upstreamEnabled}
                      filesText={routingDraft.domainsFilesText}
                      urlsText={routingDraft.domainsUrlsText}
                      status={domainsStatus}
                      busy={busy}
                      busyKeyPrefix="domains"
                      onFilesTextChange={(value) =>
                        onRoutingDraftChange({ ...routingDraft, domainsFilesText: value })
                      }
                      onUrlsTextChange={(value) =>
                        onRoutingDraftChange({ ...routingDraft, domainsUrlsText: value })
                      }
                      onPreviewUrl={onPreviewDomainsUrl}
                      onRefreshUrl={onRefreshDomainsUrl}
                    />
                  )}
                </section>
                <p className="muted-line">
                  Route/domain sources are saved together with the rest of this dialog
                  (Save settings below) -- fill these in, click Save, then validate/download
                  each URL.
                </p>
              </div>
            )}
          </details>

          <details className="settings-details upstream-settings-section">
            <summary>Advanced</summary>
            <div className="settings-grid settings-details-body">
              <label>
                <span>Main interface</span>
                <input
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
                  value={routingDraft.fwmark}
                  onChange={(event) =>
                    onRoutingDraftChange({ ...routingDraft, fwmark: event.target.value })
                  }
                />
              </label>
              <label>
                <span>Routing table id</span>
                <input
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
                  value={routingDraft.nftPrefix}
                  onChange={(event) =>
                    onRoutingDraftChange({ ...routingDraft, nftPrefix: event.target.value })
                  }
                />
              </label>
            </div>
          </details>
          </SettingsTabs>

          <div className="modal-actions">
            <button
              className="primary-button"
              disabled={busy === "upstream-settings" || busy === "routing-settings"}
              type="submit"
            >
              <Save size={18} aria-hidden="true" />
              <span>Save</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
