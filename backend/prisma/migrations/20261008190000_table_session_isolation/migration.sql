ALTER TABLE `DiningTable` ADD COLUMN `currentSessionId` CHAR(36) NULL,
  ADD UNIQUE INDEX `DiningTable_currentSessionId_key` (`currentSessionId`);
ALTER TABLE `Order` ADD COLUMN `tableSessionId` CHAR(36) NULL,
  ADD INDEX `Order_tableId_tableSessionId_status_idx` (`tableId`, `tableSessionId`, `status`);
ALTER TABLE `Reservation` ADD COLUMN `tableSessionId` CHAR(36) NULL;

-- Preserve ongoing visits without guessing ownership of paid/served history.
UPDATE `DiningTable` t SET t.`currentSessionId` = UUID()
WHERE t.`status` = 'OCCUPIED'
  OR EXISTS (SELECT 1 FROM `Order` o WHERE o.`tableId` = t.`id`
    AND o.`status` <> 'CANCELLED' AND (o.`paymentStatus` IN ('UNPAID','WAITING_CONFIRMATION')
      OR o.`status` IN ('PENDING','PREPARING','READY')))
  OR EXISTS (SELECT 1 FROM `Reservation` r WHERE r.`tableId` = t.`id` AND r.`status` = 'CHECKED_IN');
UPDATE `Order` o JOIN `DiningTable` t ON t.`id` = o.`tableId`
SET o.`tableSessionId` = t.`currentSessionId`
WHERE t.`currentSessionId` IS NOT NULL AND o.`status` <> 'CANCELLED'
  AND (o.`paymentStatus` IN ('UNPAID','WAITING_CONFIRMATION') OR o.`status` IN ('PENDING','PREPARING','READY'));
UPDATE `Reservation` r JOIN `DiningTable` t ON t.`id` = r.`tableId`
SET r.`tableSessionId` = t.`currentSessionId`
WHERE r.`status` = 'CHECKED_IN' AND t.`currentSessionId` IS NOT NULL;
