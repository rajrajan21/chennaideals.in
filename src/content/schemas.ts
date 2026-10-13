import { z } from 'zod';
export const schemas = {
  pages: {
    home: z.object({
      "dealOfTheDay": z.object({
        "title": z.string(),
        "originalPrice": z.string(),
        "salePrice": z.string(),
        "savings": z.string(),
        "retailer": z.string(),
        "area": z.string(),
        "badge": z.string(),
        "ctaLabel": z.string(),
        "expiresLabel": z.string()
      }),
      "trendingTicker": z.array(z.object({
        "id": z.string(),
        "text": z.string()
      })),
      "deals": z.array(z.object({
        "id": z.string(),
        "title": z.string(),
        "originalPrice": z.string(),
        "salePrice": z.string(),
        "savings": z.string(),
        "retailer": z.string(),
        "area": z.string(),
        "score": z.number(),
        "comments": z.number(),
        "timeAgo": z.string(),
        "isHot": z.boolean(),
        "category": z.string()
      })),
      "areas": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "dealCount": z.number(),
        "emoji": z.string()
      })),
      "retailers": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "dealCount": z.number(),
        "colorClass": z.string()
      }))
    }),
    deal_detail: z.object({
      "meta": z.object({
        "title": z.string(),
        "description": z.string()
      }),
      "labels": z.object({
        "backLink": z.string(),
        "upvote": z.string(),
        "downvote": z.string(),
        "viewDeal": z.string(),
        "comments": z.string(),
        "addComment": z.string(),
        "submitComment": z.string(),
        "loginToComment": z.string(),
        "loginToVote": z.string()
      })
    })
  }
};
export type Schemas = typeof schemas;
