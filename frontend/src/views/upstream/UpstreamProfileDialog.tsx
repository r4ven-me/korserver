import { Fingerprint, Save, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { CertSourceField, type CertSourceMode } from "../../components/CertSourceField";
import { ActionButton, IconButton } from "../../components/ui";
import type { UpstreamProfileDraft } from "../../api";

export function UpstreamProfileDialog({
  draft,
  isEdit,
  busy,
  onDraftChange,
  onClose,
  onSave,
  onFetchPin
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
  onFetchPin: () => void;
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
          <label title="fwmark/table id offset for this profile's own client/host routes, added to the routing fwmark/table id. Leave empty to derive it from the profile's position in the list; each profile needs a distinct value.">
            <span>Routing offset</span>
            <input
              type="number"
              min={1}
              step={1}
              value={draft.routing_offset}
              onChange={(event) => onDraftChange({ ...draft, routing_offset: event.target.value })}
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
          <div
            className="field-label"
            title="Trust exactly this server certificate (openconnect --servercert). Needed when the upstream's certificate isn't signed by a public CA, e.g. another Korvus Server with its own CA."
          >
            <span id="upstream-server-cert-pin-label">Server cert pin</span>
            <div className="field-with-action">
              <input
                aria-labelledby="upstream-server-cert-pin-label"
                value={draft.server_cert_pin}
                onChange={(event) =>
                  onDraftChange({ ...draft, server_cert_pin: event.target.value })
                }
                placeholder="pin-sha256:..."
              />
              <ActionButton
                label="Fetch"
                icon={Fingerprint}
                busy={busy === "upstream-fetch-pin"}
                disabled={!draft.server.trim()}
                title="Read the certificate the server presents and pin it after you confirm"
                onClick={onFetchPin}
              />
            </div>
          </div>
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
          <div className="profile-routing-group">
            <label
              className="switch"
              title="Route these specific CIDRs/domains through this profile specifically, regardless of which profile is active/default. Leave off to only carry traffic when this profile is active."
            >
              <input
                checked={draft.route_clients_enabled}
                onChange={(event) =>
                  onDraftChange({ ...draft, route_clients_enabled: event.target.checked })
                }
                type="checkbox"
              />
              <span>Route client traffic through this profile</span>
            </label>
            {draft.route_clients_enabled && (
              <div className="settings-grid">
                <label>
                  <span>Client routes</span>
                  <textarea
                    value={draft.routes}
                    onChange={(event) => onDraftChange({ ...draft, routes: event.target.value })}
                    rows={3}
                  />
                </label>
                <label>
                  <span>Client domains</span>
                  <textarea
                    value={draft.domains}
                    onChange={(event) => onDraftChange({ ...draft, domains: event.target.value })}
                    rows={3}
                  />
                </label>
              </div>
            )}
          </div>
          <div className="profile-routing-group">
            <label
              className="switch"
              title="Route the server host's own traffic (not VPN clients) through this profile specifically, on its own subnet/domain lists -- independent of the client routing above and of the global Server-side routing host-traffic setting."
            >
              <input
                checked={draft.route_host_enabled}
                onChange={(event) =>
                  onDraftChange({ ...draft, route_host_enabled: event.target.checked })
                }
                type="checkbox"
              />
              <span>Route host traffic through this profile</span>
            </label>
            {draft.route_host_enabled && (
              <div className="settings-grid">
                <label>
                  <span>Host routes</span>
                  <textarea
                    value={draft.host_routes}
                    onChange={(event) =>
                      onDraftChange({ ...draft, host_routes: event.target.value })
                    }
                    rows={3}
                  />
                </label>
                <label>
                  <span>Host domains</span>
                  <textarea
                    value={draft.host_domains}
                    onChange={(event) =>
                      onDraftChange({ ...draft, host_domains: event.target.value })
                    }
                    rows={3}
                  />
                </label>
              </div>
            )}
          </div>
          <div className="profile-status-switches">
          <label
            className="switch"
            title="Accept whatever certificate the server presents at each connect (it is pinned automatically, since openconnect no longer has --no-cert-check). Insecure: prefer 'Server cert pin'. Ignored when a pin is set."
          >
            <input
              checked={draft.trusted_cert}
              onChange={(event) => onDraftChange({ ...draft, trusted_cert: event.target.checked })}
              type="checkbox"
            />
            <span>No cert check</span>
          </label>
          <label
            className="switch"
            title="Turns on the whole Upstream feature (upstream.enabled) when you save -- affects every profile, not just this one. Leave off while you're still setting things up. Independent of 'This profile enabled' below, which only concerns this one profile."
          >
            <input
              checked={draft.enable}
              onChange={(event) => onDraftChange({ ...draft, enable: event.target.checked })}
              type="checkbox"
            />
            <span>Turn on Upstream (all profiles)</span>
          </label>
          <label
            className="switch"
            title="This profile only -- not the whole Upstream feature (see the toggle above for that). Whether the watchdog keeps THIS specific profile dialed. Off disconnects it (if it's the active profile, that also clears the active selection) and keeps the watchdog from redialing it -- independent of failover, which only controls automatic switching."
          >
            <input
              checked={draft.enabled}
              onChange={(event) => onDraftChange({ ...draft, enabled: event.target.checked })}
              type="checkbox"
            />
            <span>This profile enabled</span>
          </label>
          </div>
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
