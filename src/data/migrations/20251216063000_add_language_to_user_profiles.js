exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable("user_profiles");
  if (! hasTable) return;

  const hasLanguageColumn = await knex.schema.hasColumn("user_profiles", "language");
  if (! hasLanguageColumn) {
    await knex.schema.alterTable("user_profiles", table => {
      table.string("language", 5);
    });
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable("user_profiles");
  if (! hasTable) return;

  const hasLanguageColumn = await knex.schema.hasColumn("user_profiles", "language");
  if (hasLanguageColumn) {
    await knex.schema.alterTable("user_profiles", table => {
      table.dropColumn("language");
    });
  }
};
