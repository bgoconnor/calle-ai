import type { PublishedSite } from "./types";

const missionMap = "https://maps.google.com/?q=2164+Mission+St,+San+Francisco,+CA";

export const mockSites: Record<string, PublishedSite> = {
  yucatasia: {
    slug: "yucatasia",
    kind: "restaurant",
    theme: "yucatasia",
    conceptLabel: "Concept demo by Calle AI · Details require owner review before publishing.",
    business: {
      name: "Yucatasia",
      eyebrow: { es: "Cocina yucateca · La Mission", en: "Yucatán cooking · The Mission" },
      contact: {
        address: "2164 Mission St", city: "San Francisco, CA", phone: "(415) 000-0000", mapsUrl: missionMap,
        hours: [
          { days: { es: "Lunes — Jueves", en: "Monday — Thursday" }, hours: "11:30 – 21:00" },
          { days: { es: "Viernes — Sábado", en: "Friday — Saturday" }, hours: "11:30 – 22:00" },
          { days: { es: "Domingo", en: "Sunday" }, hours: "12:00 – 20:00" },
        ],
      },
    },
    hero: {
      title: { es: "Sabores de Yucatán en el corazón de la Mission.", en: "Yucatán flavors in the heart of the Mission." },
      subtitle: { es: "Recetas de familia, maíz hecho a mano y platos para compartir.", en: "Family recipes, handmade corn, and dishes made for sharing." },
      cta: { es: "Ver el menú", en: "Explore the menu" },
      image: "https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=1600&q=85",
    },
    story: { es: "La cocina yucateca tiene su propio acento: achiote, cítricos, chiles tostados y masa de maíz. Aquí los nombres se quedan en español, porque cada plato cuenta una historia.", en: "Yucatán cuisine has its own accent: achiote, citrus, toasted chiles, and corn masa. We keep the Spanish names because every dish carries a story." },
    sections: [
      { title: { es: "Antojitos", en: "Antojitos" }, items: [
        { name: { es: "Panuchos", en: "Panuchos" }, price: "$5", description: { es: "Tortilla rellena de frijol, frita y cubierta con pavo o cochinita.", en: "A bean-filled tortilla, fried until crisp and topped with turkey or slow-roasted pork." }, note: { es: "Contiene gluten: consultar", en: "Ask us about gluten" } },
        { name: { es: "Salbutes", en: "Salbutes" }, price: "$5", description: { es: "Tortilla suave y esponjosa con pavo o cochinita.", en: "A soft, puffy fried tortilla topped with turkey or slow-roasted pork." } },
        { name: { es: "Empanadas de queso", en: "Cheese empanadas" }, price: "$4", description: { es: "Masa de maíz dorada, queso derretido y salsa de la casa.", en: "Golden corn masa with melted cheese and house salsa." }, tag: { es: "Vegetariano", en: "Vegetarian" } },
      ] },
      { title: { es: "Platos yucatecos", en: "Yucatán classics" }, items: [
        { name: { es: "Cochinita Pibil", en: "Cochinita Pibil" }, price: "$17", description: { es: "Cerdo marinado en achiote y naranja agria, cocido lentamente y servido con cebolla morada encurtida.", en: "Pork marinated in achiote and sour orange, slow-roasted and served with pickled red onions." } },
        { name: { es: "Poc Chuc", en: "Poc Chuc" }, price: "$18", description: { es: "Cerdo a la parrilla con cítricos, acompañado de cebolla, frijoles y tortillas.", en: "Citrus-marinated grilled pork with onions, beans, and tortillas." } },
        { name: { es: "Relleno Negro", en: "Relleno Negro" }, price: "$19", description: { es: "Guiso tradicional de Yucatán de pavo y chiles tostados, con relleno de cerdo y huevo.", en: "Traditional Yucatán turkey stew darkened with toasted chiles, served with a pork-and-egg filling." }, note: { es: "Pregunta por disponibilidad", en: "Ask about availability" } },
      ] },
      { title: { es: "Bebidas", en: "Drinks" }, items: [
        { name: { es: "Agua de jamaica", en: "Hibiscus agua fresca" }, price: "$4", description: { es: "Flor de jamaica, cítricos y un toque de dulzor.", en: "Tart hibiscus, citrus, and a touch of sweetness." } },
        { name: { es: "Horchata", en: "Horchata" }, price: "$4", description: { es: "Arroz, canela y vainilla.", en: "Rice, cinnamon, and vanilla." } },
      ] },
    ],
    guide: { title: { es: "¿Primera vez con comida yucateca?", en: "New to Yucatán food?" }, body: { es: "Empieza con panuchos para algo crujiente, cochinita pibil para el clásico, y agua de jamaica para acompañar.", en: "Start with panuchos for crunch, cochinita pibil for the classic, and hibiscus agua fresca to drink." }, picks: ["Panuchos", "Cochinita Pibil", "Agua de jamaica"] },
    faqs: [
      { question: { es: "¿Cuál es la diferencia entre panuchos y salbutes?", en: "What is the difference between panuchos and salbutes?" }, answer: { es: "El panucho lleva frijol dentro y queda crujiente; el salbut es más suave y esponjoso.", en: "Panuchos have beans inside and a crisp finish; salbutes are softer and puffier." } },
      { question: { es: "¿Tienen opciones vegetarianas?", en: "Do you have vegetarian options?" }, answer: { es: "Sí. Pregunta por las empanadas, antojitos y opciones del día.", en: "Yes. Ask us about empanadas, antojitos, and daily options." } },
    ],
  },
  "chelys-beauty-salon": {
    slug: "chelys-beauty-salon", kind: "salon", theme: "chelys", conceptLabel: "Concept redesign by Calle AI · Not affiliated with or endorsed by Chely’s Beauty Salon.",
    business: { name: "Chely’s Beauty Salon", eyebrow: { es: "Belleza con color · La Mission", en: "Colorful beauty · The Mission" }, contact: { address: "2260 Mission St", city: "San Francisco, CA", phone: "(415) 000-0000", mapsUrl: "https://maps.google.com/?q=2260+Mission+St,+San+Francisco,+CA", hours: [{ days: { es: "Martes — Sábado", en: "Tuesday — Saturday" }, hours: "10:00 – 19:00" }, { days: { es: "Domingo — Lunes", en: "Sunday — Monday" }, hours: "Cerrado / Closed" }] } },
    hero: { title: { es: "Tu estilo. Tu brillo. Tu salón.", en: "Your style. Your shine. Your salon." }, subtitle: { es: "Servicios de cabello, pestañas y cejas en la Mission.", en: "Hair, lash, and brow services in the Mission." }, cta: { es: "Ver servicios", en: "View services" }, image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&q=85" },
    story: { es: "Un espacio alegre para sentirte tú. Ven con una idea, una foto o ganas de cambiar: te ayudamos a encontrar tu próximo look.", en: "A joyful space to feel like yourself. Bring an idea, a photo, or a feeling—we’ll help you find your next look." },
    sections: [
      { title: { es: "Cabello", en: "Hair" }, items: [
        { name: { es: "Corte y peinado", en: "Cut & style" }, price: "Desde $45", description: { es: "Consulta, corte y acabado para tu día a día o una ocasión especial.", en: "Consultation, haircut, and finishing style for everyday or special occasions." } },
        { name: { es: "Color y mechas", en: "Color & highlights" }, price: "Consulta", description: { es: "Color personalizado con una consulta antes de tu cita.", en: "Personalized color with a consultation before your appointment." } },
        { name: { es: "Tratamiento capilar", en: "Hair treatment" }, price: "Desde $30", description: { es: "Hidratación y cuidado para cabello que necesita un reinicio.", en: "Hydration and care for hair that needs a reset." } },
      ] },
      { title: { es: "Cejas y pestañas", en: "Brows & lashes" }, items: [
        { name: { es: "Planchado de cejas", en: "Brow lamination" }, price: "Desde $45", description: { es: "Da una apariencia más definida y peinada a tus cejas naturales.", en: "Gives natural brows a fuller, brushed, more defined look." } },
        { name: { es: "Rizado de pestañas", en: "Lash lift" }, price: "Desde $55", description: { es: "Realza tus pestañas naturales con una curvatura suave.", en: "Enhances your natural lashes with a soft, lasting curl." } },
      ] },
    ],
    faqs: [
      { question: { es: "¿Necesito cita?", en: "Do I need an appointment?" }, answer: { es: "Te recomendamos llamar antes de venir para confirmar disponibilidad.", en: "Please call before visiting to confirm availability." } },
      { question: { es: "¿Puedo traer una foto de referencia?", en: "Can I bring a reference photo?" }, answer: { es: "¡Sí! Una foto ayuda a conversar sobre tu look ideal.", en: "Absolutely. A photo helps us talk through your ideal look." } },
    ],
  },
};

export const getMockSite = (slug: string) => mockSites[slug];
