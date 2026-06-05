export const CATEGORIES = [
  "Products",
  "Fashion",
  "Beauty",
  "Home",
  "Recipes",
  "Travel",
  "Fitness",
  "Parenting",
  "Business Ideas",
  "Shopping Deals",
  "Entertainment",
  "Videos",
  "Education",
  "Needs Review",
  "Uncategorized",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CONTENT_TYPES = [
  "Recipe", "Fashion", "Product", "Home", "Travel",
  "Tutorial", "Fitness", "Beauty", "Parenting", "Business",
  "Entertainment", "Other",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const MEDIA_FORMATS = [
  "Video", "Article", "Webpage", "Social Post", "Product Page", "Image",
] as const;

export const SUBCATEGORY_TAXONOMY: Record<string, string[]> = {
  Recipe:        ["Breakfast", "Lunch", "Dinner", "Desserts", "Appetizers", "Snacks", "Drinks", "Meal Prep", "Salad", "Soup", "Baking", "Sides"],
  // Fashion covers ALL wearable/carriable items regardless of retailer.
  // Shoes = boots, sneakers, heels, sandals — all footwear goes here.
  Fashion:       ["Dresses", "Tops & Shirts", "Pants & Jeans", "Shorts", "Shoes", "Handbags", "Jewelry", "Accessories", "Swimwear", "Activewear", "Workwear", "Vacation"],
  // Products = non-wearable goods. Clothing is intentionally absent.
  Product:       ["Electronics", "Kitchen & Appliances", "Home & Decor", "Furniture", "Beauty & Skincare", "Fitness Equipment", "Tools & Hardware", "Gifts & Other"],
  Travel:        ["Mexico", "Europe", "Asia", "Caribbean", "Beach & Resorts", "Weekend Trips", "Restaurants", "Activities", "Budget", "Luxury", "Destinations"],
  Home:          ["Living Room", "Bedroom", "Kitchen", "Bathroom", "Outdoor", "Organization", "DIY", "Lighting", "Furniture", "Decor & Styling"],
  Tutorial:      ["Cooking", "Makeup & Beauty", "DIY & Crafts", "Tech", "Fitness", "Fashion", "Photography & Film", "How-To"],
  Fitness:       ["Strength Training", "Cardio", "Yoga", "HIIT", "Running", "Pilates", "Stretching", "Nutrition", "Workouts"],
  Beauty:        ["Skincare", "Makeup", "Hair", "Nails", "Fragrance", "Body Care", "Tools & Gadgets"],
  Parenting:     ["Baby", "Toddler", "School Age", "Teen", "Pregnancy", "Feeding", "Sleep", "Kids & Family"],
  Business:      ["Marketing", "Finance", "Productivity", "Side Hustle", "E-commerce", "Social Media", "Branding", "Entrepreneurship"],
  Entertainment: ["Movies & TV", "Music", "Gaming", "Books", "Podcasts", "Comedy"],
};
