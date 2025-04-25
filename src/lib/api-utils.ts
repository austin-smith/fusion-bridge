import { PikoApiError, PikoErrorCode } from '@/services/drivers/piko'; // Import if needed directly, or rely on type checking

/**
 * Maps Piko error IDs or status codes to appropriate HTTP status codes.
 * Used specifically for errors originating from the Piko driver.
 * @param error An error object, ideally a PikoApiError.
 * @returns HTTP status code.
 */
export function mapPikoErrorResponse(error: unknown): { status: number; message: string } {
  let status = 500;
  let message = 'An unknown error occurred';

  if (error instanceof PikoApiError) {
    message = error.errorString || error.message;
    // Determine default status based on context if possible, fallback to 502 for generic Piko issues
    const defaultStatus = error.statusCode || 
                        (error.errorId === 'unauthorized' || error.message.includes('Authentication failed')) ? 401 
                        : (error.errorId === 'notFound') ? 404
                        : 502; // Default to Bad Gateway for upstream errors

    switch (error.errorId) {
      case PikoErrorCode.MissingParameter:
      case PikoErrorCode.InvalidParameter:
      case PikoErrorCode.BadRequest:
      case PikoErrorCode.UnsupportedMediaType:
        status = 400; // Bad Request
        break;
      case PikoErrorCode.Unauthorized:
      case PikoErrorCode.SessionExpired:
      case PikoErrorCode.SessionRequired:
        status = 401; // Unauthorized
        break;
      case PikoErrorCode.Forbidden:
        status = 403; // Forbidden
        break;
      case PikoErrorCode.NotFound:
        status = 404; // Not Found
        break;
      case PikoErrorCode.Conflict:
        status = 409; // Conflict
        break;
      case PikoErrorCode.NotAllowed:
        status = 405; // Method Not Allowed
        break;
      case PikoErrorCode.CantProcessRequest: // Note: Mapping to 500, could be 503 depending on context
      case PikoErrorCode.InternalServerError:
      case PikoErrorCode.NotImplemented:
        status = 500; // Internal Server Error
        break;
      case PikoErrorCode.ServiceUnavailable:
        status = 503; // Service Unavailable
        break;
      default:
        status = defaultStatus; // Use default logic if no specific errorId match
    }
    // Override status if a specific non-image/media type error occurs in relevant endpoints
    if (message.includes('Expected an image response') || message.includes('Expected a media stream')) {
      status = 502; // Explicitly Bad Gateway for content type issues
    }

  } else if (error instanceof Error) {
    message = error.message;
    // Handle common config/DB errors potentially thrown *before* PikoApiError
    if (message.includes('Connector not found')) status = 404;
    else if (message.includes('not a valid Piko Cloud connector') || 
             message.includes('missing the selected system ID') || 
             message.includes('invalid JSON or structure')) status = 400;
    // else keep default 500 for generic errors (DB connection, etc.)

  } else {
    message = String(error);
  }

  console.error(`Mapped error to status ${status}: ${message}`);
  return { status, message };
} 