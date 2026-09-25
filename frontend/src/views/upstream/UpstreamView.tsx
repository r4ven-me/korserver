import { CheckCircle2, Pencil, Plus, Power, RadioTower, Settings, Star, Trash2, Unplug } from "lucide-react";
import { LastCommandPanel } from "../../components/CommandOutput";
import { Table } from "../../components/Table";
import { ActionButton, IconButton, Pill } from "../../components/ui";
import { formatDuration } from "../../lib/format";
import type { CommandResult, UpstreamProfile, UpstreamStatus } from "../../api";

export function UpstreamView({
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
  onConnectProfile: (profile: string) => void;
  onDisconnectProfile: (profile: string) => void;
}) {
  const enabled = Boolean(status?.enabled);
  const hasProfile = profiles.length > 0;
  const activeProfile = status?.active_profile ?? null;
  const connectionFor = (name: string) =>
    status?.connections.find((connection) => connection.profile === name);
  const connectedNames = new Set(
    (status?.connections ?? [])
      .filter((connection) => connection.connected)
      .map((connection) => connection.profile)
  );
  // Default profile first, then whatever else is currently connected, then
  // the rest in the order they were added -- Array.sort is stable, so a
  // rank-only comparator preserves each group's original relative order.
  const rank = (profile: UpstreamProfile) => {
    if (profile.name === activeProfile) {
      return 0;
    }
    return connectedNames.has(profile.name) ? 1 : 2;
  };
  const sortedProfiles = [...profiles].sort((a, b) => rank(a) - rank(b));

  return (
    <section className="panel upstream-profiles-panel">
      <div className="panel-header">
        <h2>Profiles</h2>
        <div className="toolbar">
          <Pill kind={enabled ? "ok" : "muted"}>{enabled ? "Upstream enabled" : "Upstream disabled"}</Pill>
          <ActionButton label="Settings" icon={Settings} onClick={onOpenSettings} />
          <ActionButton
            label={enabled ? "Disable" : "Enable"}
            icon={Power}
            primary={!enabled}
            danger={enabled}
            disabled={!enabled && !hasProfile}
            busy={busy === "upstream-settings"}
            onClick={() => onSetEnabled(!enabled)}
          />
          <ActionButton label="Create profile" icon={Plus} onClick={onCreateProfile} />
        </div>
      </div>
      <Table columns={["Name", "Server", "Interface", "Status", "Actions"]} empty="No profiles yet">
        {sortedProfiles.map((profile) => {
          const connection = connectionFor(profile.name);
          const profileConnected = Boolean(connection?.connected);
          const isDefault = profile.name === activeProfile;
          return (
            <tr key={profile.name}>
              <td className="strong-cell">
                <div className="inline-tools">
                  <span>{profile.name}</span>
                  {isDefault && <Pill kind="ok">Default</Pill>}
                </div>
              </td>
              <td>{`${profile.server}:${profile.port}`}</td>
              <td>{connection?.interface ?? profile.interface ?? "auto"}</td>
              <td>
                <div className="upstream-status-cell">
                  {!profile.enabled ? (
                    <Pill kind="muted">disabled</Pill>
                  ) : profileConnected ? (
                    <Pill kind="ok">connected</Pill>
                  ) : (
                    <Pill kind="muted">down</Pill>
                  )}
                  {profileConnected && (
                    <>
                      <span className="muted-line">
                        {`Internal ${connection?.local_ip ?? "-"} / External ${connection?.remote ?? "-"}`}
                      </span>
                      <span className="muted-line">
                        {`Connected for ${formatDuration(connection?.connected_for_seconds ?? null)}`}
                      </span>
                      {connection?.connected_since && (
                        <span
                          className="muted-line"
                          title="This timestamp resets when the OpenConnect process reconnects or restarts."
                        >
                          {`Since ${new Date(connection.connected_since).toLocaleString()}`}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </td>
              <td>
                <div className="toolbar">
                  {profileConnected ? (
                    <IconButton
                      label="Disconnect"
                      icon={Unplug}
                      busy={busy === `upstream-profile-disconnect-${profile.name}`}
                      onClick={() => onDisconnectProfile(profile.name)}
                    />
                  ) : (
                    <IconButton
                      label="Connect"
                      icon={RadioTower}
                      disabled={!profile.enabled}
                      busy={busy === `upstream-profile-connect-${profile.name}`}
                      onClick={() => onConnectProfile(profile.name)}
                    />
                  )}
                  <IconButton
                    label={isDefault ? "Default profile" : "Make default profile"}
                    icon={isDefault ? CheckCircle2 : Star}
                    disabled={isDefault || !profile.enabled}
                    busy={busy === `switch-${profile.name}`}
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
      {commandOutput && (
        <LastCommandPanel title="Last upstream command" result={commandOutput} onClose={onClearCommand} />
      )}
    </section>
  );
}
