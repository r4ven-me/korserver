from __future__ import annotations

from korserver.services.secrets import mask_text


def test_mask_text_redacts_secret_assignments_without_hiding_paths() -> None:
    rendered = "\n".join(
        [
            "password=korserverctl-local",
            "camouflage_secret = tunnel-word",
            "cert-pass: bundle-pass",
            "secrets_dir=/var/lib/korserver/secrets",
        ]
    )

    masked = mask_text(rendered)

    assert "password=***" in masked
    assert "cert-pass: ***" in masked
    assert "secrets_dir=/var/lib/korserver/secrets" in masked
    assert "korserverctl-local" not in masked
    assert "bundle-pass" not in masked

    # camouflage_secret is a shared TLS camouflage password, not a per-user
    # credential; the UI displays it in plain text instead of masking it.
    assert "camouflage_secret = tunnel-word" in masked
