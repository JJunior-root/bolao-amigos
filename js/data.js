/* ==========================================================
   DADOS — times, confrontos e elencos profissionais de 2026
   Fonte: páginas oficiais dos clubes e inscrições da Série A na CBF.
   ========================================================== */

const TEAMS = [
  { id: "athletico", name: "Athletico-PR", logo: "athletico_paranaense.jpeg" },
  { id: "atletico-mg", name: "Atlético-MG", logo: "atletico_mineiro.jpeg" },
  { id: "bahia", name: "Bahia", logo: "bahia.jpeg" },
  { id: "botafogo", name: "Botafogo", logo: "botafogo.jpeg" },
  { id: "bragantino", name: "Bragantino", logo: "bragantino.jpeg" },
  { id: "chapecoense", name: "Chapecoense", logo: "chapecoense.jpeg" },
  { id: "corinthians", name: "Corinthians", logo: "corinthians.jpeg" },
  { id: "coritiba", name: "Coritiba", logo: "coritiba.jpeg" },
  { id: "cruzeiro", name: "Cruzeiro", logo: "cruzeiro.jpeg" },
  { id: "flamengo", name: "Flamengo", logo: "flamengo.jpeg" },
  { id: "fluminense", name: "Fluminense", logo: "fluminense.jpeg" },
  { id: "gremio", name: "Grêmio", logo: "gremio.jpeg" },
  { id: "internacional", name: "Internacional", logo: "internacional.jpeg" },
  { id: "mirassol", name: "Mirassol", logo: "mirassol.jpeg" },
  { id: "palmeiras", name: "Palmeiras", logo: "palmeiras.jpeg" },
  { id: "remo", name: "Remo", logo: "remo.jpeg" },
  { id: "santos", name: "Santos", logo: "santos.jpeg" },
  { id: "sao-paulo", name: "São Paulo", logo: "sao_paulo.jpeg" },
  { id: "vasco", name: "Vasco", logo: "vasco.jpeg" },
  { id: "vitoria", name: "Vitória", logo: "vitoria.jpeg" }
];

const ROSTERS = {
  "athletico": ["Santos", "Mycael", "Matheus Soares", "João Cruz", "João Dantas", "Léo", "Jadson", "Luiz Gustavo", "Isaac", "Rivaldo", "Léo Derik", "Portilla", "Aguirre", "Kerwin Vargas", "Gaston Benavídez", "Maksym", "Vitinho", "Claudio", "Leozinho", "Mendoza", "Arthur Sehn", "Dudu", "Zapelli", "Renan", "Gilberto Junior", "Gilberto Moraes", "Felipinho", "Diogo Riquelme", "Kevin Viveros", "Lucas Esquivel", "Terán", "Arthur Dias", "Arthur Monteiro", "Chiqueti"],
  "atletico-mg": ["Everson", "Gabriel Delfim", "Robert", "Pedro Cobra", "Renan Lodi", "Angelo Preciado", "Natanael Milouski", "Kauã Pascini", "Pedro Henrique", "Ruan", "Lyanco", "Vitor Hugo", "Alexsander", "Alan Franco", "Guilherme Pires", "Victor Hugo", "Leonardo", "Samuel", "Hendel", "Igor Gomes", "Maycon", "Gustavo Scarpa", "Bernard", "Fred", "Kevin Castaño", "Mamady Cissé", "João Pedro Porto", "Tomás Pérez", "Alan Minda", "Tomás Cuello", "Cassierra", "Thiago Borbas", "Dudu", "Cauã Soares", "Vitor Fernandes", "Reinier", "Luis Gustavo", "Kaio", "Murillo"],
  "bahia": ["Ronaldo", "Léo Vieira", "Guido Herrera", "Zé Guilherme", "Roman Gomez", "Luciano Juba", "David Duarte", "Marcos Victor", "Luiz Gustavo", "Marco Moreno", "Kanu", "Everton Ribeiro", "Nicolás Acevedo", "David Martins", "Erick", "Rodrigo Nestor", "Michel Araujo", "Lautaro Lopez", "Caio Alexandre", "Jean Lucas", "Ademir", "Ruan Pablo", "Erick Pulga", "Willian José", "Sanabria", "Kauê Furquim", "Kike Olivera", "Alejo Veliz", "Everaldo", "Wendel Silva", "Victor"],
  "botafogo": ["Gabriel Batista", "Warleson", "Alex Telles", "Anthony", "Arthur Chaves", "Nahuel Ferraresi", "Gabriel Pereira", "Carlos Santos", "Kaio Pantaleão", "Lucas Monzón", "Marçal", "Mateo Ponte", "Paulo Victor", "Vitinho", "Allan", "Álvaro Montoro", "Cristian Medina", "Danilo Santos", "Domingos Andrade", "Edenilson", "Victor Hugo", "Jordan Barrera", "Hakim Ziyech", "Danilo Pereira", "Kauan Almeida", "Lucas Jales", "Matheus Martins", "Arthur Cabral", "Júnior Santos", "José Kadir Barría", "Lucas Villalba", "Tiquinho Soares"],
  "bragantino": ["Cleiton", "Tiago Volpi", "Bruno Bertinato", "Gustavo Marques", "Alix Vinicius", "Guzmán Rodríguez", "Weimar Palacios", "Vanderlan", "Andrés Hurtado", "Agustín Sant'Anna", "J. Capixaba", "Gustavo Reis", "Lucas Barbosa", "Matheus Fernandes", "Eric Ramires", "Gabriel Girotto", "Breno", "Chrystian", "Nacho Sosa", "Samuel Costa", "Rodriguinho", "Patrick", "Cauê", "Gustavo Neves", "Marcelinho", "Davi Gomes", "Eduardo", "Fabinho", "Ryan", "Jhuan Nunes", "João Gabriel", "Marcos", "Vinicinho", "Bruno Gonçalves", "Henry Mosquera", "Herrera", "Isidro Pitta", "Wallace Yan", "Yuri Alves"],
  "chapecoense": ["Anderson", "Gabriel Werner", "Kainã", "Matheus Aurélio", "Rafael Santos", "Doma", "João Paulo", "Kauan", "Rafael Thyere", "Victor Caetano", "Vinicius", "Bruno Pacheco", "Bruno Tubarão", "Dudu", "Everton", "Fernando", "Heitor", "Mancha", "Bruno Matias", "Vinicius Balieiro", "David", "Camilo", "Rosivan", "Rafael Carvalheira", "Giovanni Augusto", "Max", "Miguel Carvalho", "Robert", "Yago Felipe", "Dylan Borrero", "Franco Rossi", "Marcinho", "Maurício Garcez", "Rubens", "Túlio Eduardo", "Yannick Bolasie"],
  "corinthians": ["Hugo Souza", "Felipe Longo", "Matheus", "André Ramalho", "Matheus Bidu", "Fabrizio Angileri", "Matheuzinho", "Pedro Milans", "João Vitor", "Charles", "Gustavo Henrique", "Breno Bidon", "Rodrigo Garro", "Raniele", "Alex Santana", "André Luiz", "André Carrillo", "Memphis Depay", "Yuri Alberto", "Pedro Raul", "Vitinho", "Hugo", "Dieguinho", "Kauê C.", "Guilherme", "Kayke", "Nícollas Melo", "Allan", "João Pedro", "Jesse Lingard", "Zakaria Labyad", "Kaio Lima", "Iago Machado", "Gustavo Milani", "Luiz", "Matheus Corrêa"],
  "coritiba": ["Pedro Morisco", "Pedro Rangel", "Keiller", "Maicon", "Rodrigo Moledo", "Bruno Melo", "Fernando", "Tinga", "João Almeida", "JP Chermont", "Tiago Coser", "Vitor Tissi", "Lucas Taverna", "Benassi", "Jacy", "Sebastián Gómez", "Thiago Santos", "Josué", "Wallisson", "Paulo Roberto", "Vini Paulista", "Breno", "Keno", "Gustavo Silva", "David", "Matheus Dias", "Lucas Ronier", "Brian Ocampo", "Lavega", "Enzo", "Fabinho", "Willian Oliveira", "Renato", "Rodrigo Rodrigues", "Felipe Jonatan", "Alejandro Ararat", "Khensane", "David Alves", "Pedro Rocha", "Nicolas Fonseca", "Bustos"],
  "cruzeiro": ["Cássio", "Otávio", "Léo Aragão", "Marcelo Eráclito", "Fabrício Bruno", "João Marcelo", "Lucas Villalba", "William", "Fagner", "Kaiki Bruno", "Gabriel Rojas", "Lucas Romero", "Matheus Henrique", "Lucas Silva", "Matheus Pereira", "Gerson", "Walace", "Christian", "Wesley", "Wanderson", "Arroyo", "Luciano Rodríguez", "Sinisterra", "Neiser Villarreal", "Kaio Jorge", "Marquinhos", "Felipe de Morais", "Rayan Lelis", "Kauã Moraes", "Kaique Kenji", "Zé Lucas", "Alessandro", "Japa", "Bruno Rodrigues", "Vitor Lamounier", "Gabriel Pec", "Otávio Rezende"],
  "flamengo": ["Agustín Rossi", "Andrew", "Dyogo", "Danilo", "Léo Pereira", "Léo Ortiz", "João Souza", "Vitão", "Varela", "Emerson", "Ayrton Lucas", "Alex Sandro", "Evertton", "Erick Pulgar", "Jorge", "Jorginho", "De Arrascaeta", "De La Cruz", "Saúl", "Carrascal", "Lucas Paquetá", "Bruno Henrique", "Pedro", "Luiz", "Plata", "Samuel Lino", "Valencia", "Freitas", "Daniel Silva", "Caio", "Luiz Felipe", "Douglas Telles", "Josmar", "Johnny", "Pablo"],
  "fluminense": ["Fábio", "Vitor Eudes", "Marcelo Pitaluga", "Thiago Silva", "Jemmes", "Igor Rabello", "Freytes", "Julián Millán", "Ignacio", "Samuel Xavier", "Guga", "Guilherme Arana", "Renê", "Hércules", "Martinelli", "Nonato", "Alisson", "Ganso", "Otávio", "Wesley Natã", "Riquelme Felipe", "Keven Samuel", "Lucho Acosta", "Lezcano", "John Kennedy", "Germán Cano", "Hulk", "Kevin Serna", "Soteldo", "Canobbio", "Savarino", "Rodrigo Castillo", "Júlio Fidelis"],
  "gremio": ["Weverton", "Gabriel Grando", "Danilo", "Caio", "Matheus Nascimento", "Jefinho", "Enamorado", "Wagner Leonardo", "Diego Caito", "Filip Krovinović", "Athos", "Jovane Cabral", "Pedro Gabriel", "Riquelme", "Tetê", "Wallace", "Villasanti", "Vitor Ramon", "Francis Amuzu", "Arthur Melo", "Pavón", "Balbuena", "Luis Eduardo", "Braithwaite", "Dodi", "Erick Noriega", "Roger", "João Pedro", "Tiago", "Cristaldo", "Kannemann", "Zortéa", "Marlon", "Thiago Beltrame", "Gabriel Menegon", "Nardoni", "Carlos Vinícius", "Gustavo Martins", "Vitor Wachter", "Bernardo Schons"],
  "internacional": ["Anthoni", "Diego Esser", "Kauan Jesus", "Matheus Cunha", "Sergio Rochet", "Félix Torres", "Gabriel Mercado", "Guillermo Maripán", "Juninho", "Victor Gabriel", "Bernabei", "Braian Aguirre", "Bruno Gomes", "Matheus Bahia", "Alan Patrick", "Bruno Henrique", "Calebe", "Niclas Eliasson", "Paulinho", "Alerrandro", "Johan Carbonero", "Kayky", "Sanabria", "Vitinho"],
  "mirassol": ["Georgemy", "Walter", "Thomazella", "Alex Muralha", "Elias", "Cauã Victor", "Victor Luis", "Igor Formiga", "Daniel Borges", "Reinaldo", "Gabriel Knesowitsch", "Marcelinho", "Willian Machado", "Rodrigues", "Lucas Oliveira", "João Victor", "Wallisson", "Gustavo Cazonatti", "Japa", "Gabriel Pires", "Neto Moura", "Shaylon", "Eduardo", "Denilson", "Chico Kim", "Aldo Filho", "Zé Roberto", "Fernandinho", "Bruno Santos", "Gustavo Silva", "Tiquinho Soares", "Negueba", "Nathan Fogaça", "Galeano", "Galdino", "Edson Carioca", "Carlos Eduardo", "André Luis"],
  "palmeiras": ["Bruno Bertinato", "Carlos Miguel", "Marcelo Lomba", "Benedetti", "Bruno Fuchs", "Gustavo Gómez", "Murilo", "Alexander Barboza", "Agustín Giay", "Khellven", "Arthur", "Jefté", "Joaquín Piquerez", "Andreas Pereira", "Emiliano Martínez", "Felipe Anderson", "Larson", "Lucas Evangelista", "Marlon Freitas", "Maurício", "Jhon Arias", "Flaco López", "Paulinho", "Ramón Sosa", "Vitor Roque"],
  "remo": ["Alexandre", "Ivan", "João Victor", "Marcelo Rangel", "Duplexe Tchamba", "Léo Andrade", "Marllon", "Matheus Felipe", "Zé Ivaldo", "João Lucas", "Marlon", "Marcelinho", "Matheus Alexandre", "Mayk", "David Braga", "Edson", "Jaderson", "Leonel Picco", "Patrick", "Zé Ricardo", "Eduardo Melo", "Galeano", "Jajá", "Poveda", "Taliari", "Tico", "Vitor Bueno", "Yago Pikachu", "Zé Welison"],
  "santos": ["Diógenes", "Gabriel Brazão", "João Paulo", "João Pedro", "Rodrigo Falcão", "João Alencar", "João Ananias", "Luan Peres", "Lucas Veríssimo", "Escobar", "Rafael Gonzaga", "Vinícius Lira", "Davizinho", "Igor Vinícius", "Rodinei", "Gabriel Bontempo", "Gabriel Menino", "Lima", "Miguelito", "Neymar Jr", "Rollheiser", "Arthur", "Gustavo Henrique", "João Schmidt", "Oliva", "Samuel Pierri", "Willian Arão", "Barreal", "Caballero", "Everton", "Gabriel Barbosa", "Moisés", "Rony", "Thaciano"],
  "sao-paulo": ["Rafael", "Carlos Coronel", "Rafael Tolói", "Domingos Duarte", "Robert Arboleda", "Sabino", "Pedro Lima", "Lucas Ramon", "Enzo Díaz", "Wendell", "Cédric Soares", "Aurélio Buta", "Nicolas", "Newton", "João Pedro", "Felipe Gabriel", "Pedro Ferreira", "Ryan Francisco", "Damián Bobadilla", "Pablo Maia", "Marcos Antônio", "Luciano", "Lucas Moura", "Calleri", "Ferreira", "André", "Daniel Sertanejo", "Lucca", "Igor Felisberto", "Teté", "Luis Osorio", "Djhordney", "Artur", "Gustavo Santana", "Isac", "João Victor", "Cauly"],
  "vasco": ["Léo Jardim", "Daniel Fuzato", "Spinelli", "Bruno Duarte", "Sosa", "Puma Rodríguez", "Bruno Lopes", "Jair", "Alan Saldivia", "Adson", "Barros", "Rojas", "Lucas Piton", "Mateus Carvalho", "Cuiabano", "Bruno André", "Ramon Rique", "Riquelme Avellar", "Lucas Molarinho", "Lescano", "Euder", "Diego Minete", "Andrey", "Paulo Ibelli", "João Vitor", "Paulo Henrique", "Phillipe Gabriel", "Guilherme Estrella", "Lukas Zuccarello", "David", "Carlos Cuesta", "Thiago Mendes", "Gabriel Santos", "Nuno", "Carlos Andrés Gómez", "Hinestroza", "Marino", "Brenner", "Robert Renan", "Facundo Colidio", "Tche Tche", "Pablo de Paula"],
  "vitoria": ["Lucas Arcanjo", "Alexandre Fintelman", "Mateus Silva", "Riccieli", "Cacá", "Emanuel Brítez", "Darlan Dutra", "Luan Cândido", "Nathan Mendes", "Ramon", "Fabiano Souza", "Matheuzinho", "Caíque Gonçalves", "Emmanuel Martínez", "Zé Vitor", "Walace", "Tomás Pochettino", "Diego Tarzia", "Marinho", "Lucas Silva", "Anderson Pato", "Renê", "Alex Bruno", "Laquintana", "Erick", "Osvaldo", "Renato Kayzer", "Matheusinho", "Fabrício"]
};

/* Posição só é agrupada quando a posição atual está conferida. */
const ROSTER_POSITIONS = {};

const POSITION_ORDER = ["Goleiro", "Defensor", "Meio-campista", "Atacante"];

const FIXTURE_PAIRS = [
  ["flamengo", "fluminense"], ["corinthians", "palmeiras"],
  ["sao-paulo", "santos"], ["atletico-mg", "cruzeiro"],
  ["gremio", "internacional"], ["botafogo", "vasco"],
  ["athletico", "coritiba"], ["bahia", "vitoria"],
  ["bragantino", "mirassol"], ["chapecoense", "remo"]
];

/* ==========================================================
   PONTUAÇÃO DO BOLÃO
   - Placar exato (ex.: Vasco 3 x 0 Vitória) ............ 3 pontos
   - Acertou o resultado (vencedor/empate), sem o placar . 1 ponto
   - Derrota ou empate diferente do palpitado ........... 0 ponto
   - Cada jogador escolhido como artilheiro que marcar
     gol (1 ou mais) .................................... +1 ponto por jogador
   ========================================================== */
const POINTS = Object.freeze({ exact: 3, outcome: 1, scorer: 1 });
// Artilheiros: mínimo 1, máximo por palpite.
const MAX_SCORERS = 6;
// Limites do placar palpitado (gols por time).
const SCORE_MAX = 15;
// Fechamento dos palpites: duas horas antes do início, no horário de Brasília.
const BET_CUTOFF_HOURS = 2;

if (typeof module !== "undefined") {
  module.exports = { TEAMS, ROSTERS, ROSTER_POSITIONS, POSITION_ORDER, FIXTURE_PAIRS, POINTS, MAX_SCORERS, SCORE_MAX, BET_CUTOFF_HOURS };
}
