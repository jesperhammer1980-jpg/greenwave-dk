import geocodeHandler from './geocode.js';

export default async function handler(request, response) {
  request.query = {
    ...(request.query || {}),
    q: request.query?.q || 'Lupinvej 3, 3390 Hundested'
  };

  return geocodeHandler(request, response);
}
