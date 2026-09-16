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

Import replaces the vault inside a SQLite transaction. If validation fails, the vault you had is left untouched.

After a successful import, DeepKey locks. Unlock with the backup's master password, which might not be the password you were using a minute ago.

Keep these files somewhere you control. USB, another disk, an encrypted drive. Not a public gist.

## Plaintext `.env` export

Different from backup. The app asks:

> This file contains plaintext secrets.

That file is the real secrets, sitting in a text file. Same as copying `.env` out of a project. Do not treat it like the encrypted backup.

## Automatic local backups

Optional. Encrypted `.deepkeyvault` files written to a folder you pick. They are not uploaded.

If you turn this on, that folder is now part of your threat model. Anyone with the files still needs the master password. Anyone with the files **and** the password has the vault.

## Moving between desktop and web

The format is the same. Export from one, import on the other. You still need the master password.

Do not copy the raw SQLite file between machines unless you also understand file locks and paths. The `.deepkeyvault` export is the supported path.

## Recovery

No email reset. No hint backdoor. No key I keep for you.

If the master password is gone, the backup is as unreadable as the live vault. That is the tradeoff I chose.
