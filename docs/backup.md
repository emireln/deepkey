# Backup

## Encrypted backup (`.deepkeyvault`)

Settings → Backup → Export encrypted backup.

The file is JSON:

- `magic`: `DEEPKEYVAULT`
- `formatVersion`
- vault header (wrapped DEK + Argon2id parameters)
- encrypted records
- encrypted attachments

It is still ciphertext. Import needs the same master password as that vault.

Import asks for confirmation first, because it replaces everything in the vault. It runs inside a SQLite transaction, and if validation fails the vault you had is left untouched.

After a successful import, DeepKey locks. Unlock with the backup's master password, which might not be the password you were using a minute ago.

Keep these files somewhere you control. USB, another disk, an encrypted drive. Not a public gist.

## Plaintext `.env` export

Different from backup. The app asks:

> This file contains plaintext secrets.

That file is the real secrets, sitting in a text file. Same as copying `.env` out of a project. Do not treat it like the encrypted backup.

## Automatic local backups

Optional. Encrypted `.deepkeyvault` files written on a timer.

Desktop writes into a folder you pick, or `%APPDATA%\DeepKey\backups` (and the macOS/Linux equivalent). It keeps the last 14 of its own files, named `deepkey-<timestamp>.deepkeyvault`. Exports you save by hand into the same folder are not touched. Wiping the vault deletes these timed files from both folders the app uses, the default one and the one you picked. Exports you saved by hand stay. Web cannot write a folder quietly, so you get a banner on Overview when a backup is due and you save the file yourself.

If you turn this on, that folder is now part of your threat model. Anyone with the files still needs the master password. Anyone with the files **and** the password has the vault.

Settings → Backup → Verify backup file checks the file structure without importing it. It cannot tell whether the master password is right, because the password is only checked on import.

## Moving between desktop, web, and CLI

The format is the same. Export from one, import on the other. You still need the master password.

The CLI talks to the same sqlite file when it is on this machine (`resolveLocalVaultDb`). Encrypted `.deepkeyvault` is still the right way to move a vault to another computer.

Do not copy the raw SQLite file between machines unless you also understand file locks and paths. The `.deepkeyvault` export is the supported path.

## Recovery

No email reset. No hint backdoor. No key I keep for you.

If the master password is gone, the backup is as unreadable as the live vault. That is the tradeoff I chose.
