import geocodeHandler from './geocode.js';

export default async function handler(request, response) {
  request.query = {
    ...(request.query || {}),
    q: request.query?.q || 'Lupinvej 3, 3390 Hundested',
    debug: request.query?.debug || '1'
  };
  return geocodeHandler(request, response);
}
