import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    timeslot: timestamp('timeslot', { withTimezone: true }).notNull(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique('room_timeslot_unique').on(table.roomId, table.timeslot)],
);
