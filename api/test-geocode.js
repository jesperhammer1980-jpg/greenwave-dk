import geocodeHandler from "./geocode.js";
export default async function handler(req,res){req.query={...(req.query||{}),q:req.query?.q||"Lupinvej 3, 3390 Hundested",debug:1};return geocodeHandler(req,res);}
