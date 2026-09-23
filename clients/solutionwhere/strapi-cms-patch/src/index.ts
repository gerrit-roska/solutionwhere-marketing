import type { Core } from '@strapi/strapi';

const ARTICLE_PUBLIC_ACTIONS = [
  'api::article.article.find',
  'api::article.article.findOne',
] as const;

async function ensureArticlePublicRead(strapi: Core.Strapi): Promise<void> {
  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  if (!publicRole) {
    strapi.log.warn('Public role missing; skipped article read permissions');
    return;
  }

  for (const action of ARTICLE_PUBLIC_ACTIONS) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action, role: publicRole.id },
    });
    if (existing) continue;

    await strapi.db.query('plugin::users-permissions.permission').create({
      data: { action, role: publicRole.id },
    });
    strapi.log.info(`Granted public permission ${action}`);
  }
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await ensureArticlePublicRead(strapi);
  },
};
