// Request validation using AJV JSON Schema
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const config = require('./config');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// JSON Schema for permission request
const requestSchema = {
  type: 'object',
  required: ['requester', 'permissions_requested'],
  properties: {
    requester: {
      type: 'object',
      required: ['identity', 'name'],
      properties: {
        identity: { 
          type: 'string',
          pattern: '^arn:aws:iam::[0-9]{12}:(role|user)/.+$',
          description: 'IAM role or user ARN'
        },
        name: { 
          type: 'string',
          minLength: 1,
          maxLength: 200
        },
        email: { 
          type: 'string',
          format: 'email'
        }
      }
    },
    permissions_requested: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        required: ['action', 'resource'],
        properties: {
          action: {
            type: 'string',
            pattern: '^[a-z0-9-]+:[A-Za-z0-9*]+$',
            description: 'IAM action (e.g., s3:GetObject)'
          },
          resource: {
            type: 'string',
            pattern: '^arn:aws:[a-z0-9-]+:[a-z0-9-]*:[0-9]*:.+$',
            description: 'AWS resource ARN'
          },
          reason: {
            type: 'string',
            maxLength: 500
          }
        }
      }
    },
    expiration_minutes: {
      type: 'integer',
      minimum: 1,
      maximum: 525600, // 1 year
      default: 60
    }
  },
  additionalProperties: false
};

const validateRequest = ajv.compile(requestSchema);

/**
 * Validate permission request
 * @param {Object} requestBody - Request body to validate
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validate(requestBody) {
  const valid = validateRequest(requestBody);
  
  if (!valid) {
    return {
      valid: false,
      errors: validateRequest.errors.map(err => ({
        field: err.instancePath || err.params.missingProperty,
        message: err.message,
        value: err.data
      }))
    };
  }

  // Validate permissions against allowlist
  const permissionValidation = validatePermissions(requestBody.permissions_requested);
  if (!permissionValidation.valid) {
    return permissionValidation;
  }

  return { valid: true, errors: [] };
}

/**
 * Validate permissions against allowlist
 * @param {Array} permissions - Array of permission objects
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validatePermissions(permissions) {
  const errors = [];

  for (const perm of permissions) {
    const { action, resource } = perm;

    // Check against denylist first
    const isDenied = config.allowlist.deniedActions.some(pattern => {
      if (pattern === '*:*') return action === '*:*';
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return action.startsWith(prefix);
      }
      return action === pattern;
    });

    if (isDenied) {
      errors.push({
        field: 'permissions_requested',
        message: `Action '${action}' is explicitly denied`,
        value: action
      });
      continue;
    }

    // Check against allowlist
    const isAllowed = config.allowlist.allowedActions.some(pattern => {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return action.startsWith(prefix);
      }
      return action === pattern;
    });

    if (!isAllowed) {
      errors.push({
        field: 'permissions_requested',
        message: `Action '${action}' is not in the allowlist`,
        value: action
      });
    }

    // Check for wildcard resources on write actions
    // Allow path-specific wildcards (e.g., bucket/prefix/*) but not broad wildcards (*)
    const isReadAction = action.match(/^[a-z0-9-]+:(Get|List|Describe|Head)/i);
    const isBroadWildcard = resource === '*' || resource.match(/^arn:aws:[a-z0-9-]+:[^:]*:[^:]*:\*$/);
    
    if (!isReadAction && isBroadWildcard) {
      errors.push({
        field: 'permissions_requested',
        message: `Broad wildcard resources not allowed for write action '${action}'`,
        value: resource
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Format validation errors for API response
 * @param {Array} errors - Validation errors
 * @returns {string} Formatted error message
 */
function formatErrors(errors) {
  return errors.map(err => `${err.field}: ${err.message}`).join('; ');
}

module.exports = {
  validate,
  validatePermissions,
  formatErrors,
  requestSchema
};
