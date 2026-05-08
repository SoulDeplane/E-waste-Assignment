-- DropForeignKey (must drop before the unique index it depends on)
ALTER TABLE `Store` DROP FOREIGN KEY `Store_recyclerId_fkey`;

-- DropIndex
DROP INDEX `Store_recyclerId_key` ON `Store`;

-- CreateIndex
CREATE INDEX `Store_recyclerId_idx` ON `Store`(`recyclerId`);

-- AddForeignKey
ALTER TABLE `Store` ADD CONSTRAINT `Store_recyclerId_fkey` FOREIGN KEY (`recyclerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
