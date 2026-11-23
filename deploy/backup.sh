#!/bin/bash
# Daily backup of the certificate database. Keeps 30 days.
set -e
mkdir -p /home/buyesi/backups
sqlite3 /home/buyesi/app/buyesi.db ".backup '/home/buyesi/backups/buyesi-$(date +%F).db'"
find /home/buyesi/backups -name 'buyesi-*.db' -mtime +30 -delete
