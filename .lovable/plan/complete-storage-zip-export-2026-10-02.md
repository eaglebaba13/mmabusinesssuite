# Complete Storage ZIP Export

## Goal
Add a Super Admin-only action that downloads all files from the seven private storage buckets as one ZIP, preserving bucket names and folder paths.

## Implementation
- Add a protected server download endpoint that verifies the signed-in user and confirms the `super_admin` role before accessing storage.
- Enumerate every file in each private bucket, including nested folders and paginated listings.
- Build one ZIP named with the export date, with each bucket as its top-level folder.
- Add a Storage Export tab under Settings with confirmation, progress/status messaging, and a one-click download button.
- Keep the archive private: no public bucket, permanent link, or browser-exposed admin credential.
- Record the server-side export boundary in the project architecture rules.

## Validation
- Verify non-Super Admin requests are rejected.
- Verify an authenticated Super Admin receives a valid ZIP response.
- Inspect the ZIP entries to confirm bucket and nested folder structure are retained.
- Check the Settings page on desktop and mobile and confirm the project build remains healthy.

## Technical details
- The archive is assembled on demand and returned only to the authenticated request.
- Empty buckets remain represented as empty top-level directories.
- Failed file reads stop the export rather than silently producing an incomplete backup.
