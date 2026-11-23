# Privacy and child safeguarding

Buyesi Youth Verified handles information about children. These rules apply to everyone who uses it.

## What is stored

| Where | What |
|---|---|
| Server database | Name, certificate type, date, optional note, certificate ID, fingerprint, transaction ID, whether the holder is a child, whether a parent or guardian agreed |
| BSV blockchain | A fingerprint only, plus the tag `BYV1`. No name, no date, no programme |

The fingerprint is calculated from the whole record including a random certificate ID, so it cannot be
reversed into a name or guessed from a name.

## Rules for staff

1. Issue a child's certificate only after the **parent or guardian has agreed**. The system will not
   issue one otherwise.
2. Do not put sensitive information in the "Details" box: no home location, health, school or
   family details. Keep notes to things like "12-week course".
3. Give the printed certificate or link only to the child or their parent or guardian.
4. Never share the staff password. Never share or photograph the wallet key.
5. Do not publish children's photos or full names together with certificate links.

## What the public sees

Anyone with a certificate's link or QR code sees the certificate type, the date, and the holder's name.
For a child, the name is shortened to first name and last initial and notes are hidden.

## Removing someone's record

A record can be deleted from the database on request. The fingerprint on the blockchain cannot be
removed, but it contains no personal information, so on its own it identifies nobody.

## Backups

Backups of the database contain children's names. Store them securely and delete old ones.

## Questions

info@buyesi.org
