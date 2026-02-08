exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable("user_profiles");

  if (! hasTable) {
    await knex.schema.createTable("user_profiles", table => {
      table.string("user_id", 20).primary();
      table.string("steam_id").notNullable();
      table.datetime("created_at");
      table.datetime("updated_at");
    });
  }
};

exports.down = async function(knex) {
  if (await knex.schema.hasTable("user_profiles")) {
    await knex.schema.dropTable("user_profiles");
  }
};
