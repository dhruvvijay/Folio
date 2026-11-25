CREATE TABLE `folio_ledgers` (
  `workspace` text PRIMARY KEY NOT NULL,
  `revision` integer NOT NULL,
  `state` text NOT NULL,
  `updated_at` text NOT NULL
);
