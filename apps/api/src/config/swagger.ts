export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'MailFlow API Documentation',
    version: '1.0.0',
    description:
      'Reliable Email Job Scheduling Platform API for ReachInbox.ai Internship Assignment. Supports campaign CRUD, personalization, BullMQ job queuing, delivery worker processing, and PostgreSQL aggregated analytics.',
    contact: {
      name: 'MailFlow Engineering',
    },
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Pass Bearer token or User ID in Authorization header',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Invalid campaign state transition' },
          code: { type: 'string', example: 'INVALID_STATE_TRANSITION' },
          details: { type: 'object', nullable: true },
        },
      },
      Campaign: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string' },
          senderId: { type: 'string', nullable: true },
          name: { type: 'string', example: 'Summer Marketing Blitz' },
          subject: { type: 'string', example: 'Exclusive Offer for {{company}}' },
          body: { type: 'string', example: '<p>Hi {{firstName}}, check out our products!</p>' },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true },
          status: {
            type: 'string',
            enum: ['DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED'],
          },
          totalRecipients: { type: 'integer', example: 100 },
          sentCount: { type: 'integer', example: 85 },
          failedCount: { type: 'integer', example: 2 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CampaignRecipient: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email', example: 'john@example.com' },
          firstName: { type: 'string', nullable: true, example: 'John' },
          lastName: { type: 'string', nullable: true, example: 'Doe' },
          company: { type: 'string', nullable: true, example: 'Acme Corp' },
          status: { type: 'string', enum: ['PENDING', 'SENT', 'FAILED', 'CANCELLED'] },
        },
      },
      OverviewMetrics: {
        type: 'object',
        properties: {
          totalCampaigns: { type: 'integer', example: 12 },
          activeCampaigns: { type: 'integer', example: 2 },
          completedCampaigns: { type: 'integer', example: 8 },
          draftCampaigns: { type: 'integer', example: 2 },
          cancelledCampaigns: { type: 'integer', example: 0 },
          totalRecipients: { type: 'integer', example: 1500 },
          emailsQueued: { type: 'integer', example: 50 },
          emailsSent: { type: 'integer', example: 1420 },
          emailsFailed: { type: 'integer', example: 30 },
          deliveryRate: { type: 'number', format: 'float', example: 97.9 },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Check API Server Health',
        description: 'Returns health status of the API server and database connection',
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/campaigns': {
      get: {
        summary: 'List User Campaigns',
        description: 'Retrieves all email campaigns owned by the authenticated user with optional status filtering',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED'],
            },
          },
        ],
        responses: {
          '200': {
            description: 'List of campaigns',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    campaigns: { type: 'array', items: { $ref: '#/components/schemas/Campaign' } },
                    total: { type: 'integer', example: 5 },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/UnauthorizedError' },
        },
      },
      post: {
        summary: 'Create New Email Campaign',
        description: 'Creates a new email campaign draft',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'subject', 'body'],
                properties: {
                  name: { type: 'string', example: 'Q4 Product Launch' },
                  subject: { type: 'string', example: 'Introducing New Features for {{company}}' },
                  body: { type: 'string', example: '<p>Hi {{firstName}}, check out what is new!</p>' },
                  senderId: { type: 'string' },
                  scheduledAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Campaign created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Campaign' },
              },
            },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/api/campaigns/{id}': {
      get: {
        summary: 'Get Campaign Details',
        description: 'Fetches details of a specific campaign including recipient status breakdown',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Campaign details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Campaign' },
              },
            },
          },
          '404': { description: 'Campaign not found or access denied' },
        },
      },
      put: {
        summary: 'Update Campaign Draft',
        description: 'Updates a campaign while it is in DRAFT state',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                  senderId: { type: 'string' },
                  scheduledAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Campaign updated successfully' },
          '400': { description: 'Invalid state or payload' },
        },
      },
      delete: {
        summary: 'Delete Campaign',
        description: 'Deletes a campaign if it is not currently SENDING or QUEUED',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Campaign deleted successfully' },
          '400': { description: 'Cannot delete active campaign' },
        },
      },
    },
    '/api/campaigns/{id}/recipients': {
      post: {
        summary: 'Set Campaign Recipients',
        description: 'Attaches relational recipients list to a campaign',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['recipients'],
                properties: {
                  recipients: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['email'],
                      properties: {
                        email: { type: 'string', format: 'email' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        company: { type: 'string' },
                        customData: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Recipients attached successfully' },
        },
      },
    },
    '/api/campaigns/{id}/launch': {
      post: {
        summary: 'Launch Campaign Asynchronously',
        description: 'Validates recipients and sender, transitions campaign status to SENDING, enqueues BullMQ delayed queue jobs, and returns HTTP 202 Accepted',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '202': {
            description: 'Campaign launch initiated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Campaign launch initiated successfully' },
                    campaign: { $ref: '#/components/schemas/Campaign' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid state or missing sender/recipients' },
        },
      },
    },
    '/api/analytics/overview': {
      get: {
        summary: 'Get Platform Delivery Analytics',
        description: 'Returns aggregated PostgreSQL metrics for campaigns, emails delivered, queued, failed, and overall delivery rate',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Analytics overview data',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OverviewMetrics' },
              },
            },
          },
        },
      },
    },
  },
  responses: {
    UnauthorizedError: {
      description: 'Authentication token missing or invalid',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    },
    ValidationError: {
      description: 'Invalid input fields',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    },
  },
};
