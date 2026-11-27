import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

// Separate models make bedtime/wake-up and sleepiness scores required for
// their respective entry types. Existing local IDs can be retained on import.
const schema = a.schema({
  OvernightSleep: a
    .model({
      // Declare client-supplied IDs so field-level auth includes them on create.
      id: a.id().required(),
      start: a.datetime().required(),
      end: a.datetime().required(),
      note: a.string().validate((v) => v.maxLength(500)),
      // Ownership is assigned by Cognito and cannot be transferred by clients.
      owner: a
        .string()
        .authorization((allow) => [allow.owner().to(['read', 'delete'])]),
    })
    .authorization((allow) => [allow.owner()]),

  SleepinessCheckin: a
    .model({
      id: a.id().required(),
      start: a.datetime().required(),
      score: a
        .integer()
        .required()
        .validate((v) => v.gte(1).lte(7)),
      note: a.string().validate((v) => v.maxLength(500)),
      owner: a
        .string()
        .authorization((allow) => [allow.owner().to(['read', 'delete'])]),
    })
    .authorization((allow) => [allow.owner()]),

  SleepSettings: a
    .model({
      id: a.id().required(),
      goal: a
        .float()
        .required()
        .validate((v) => v.gte(4).lte(12)),
      owner: a
        .string()
        .authorization((allow) => [allow.owner().to(['read', 'delete'])]),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
