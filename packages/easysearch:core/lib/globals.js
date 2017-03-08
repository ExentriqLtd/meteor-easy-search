import {
  Index,
  Engine,
  ReactiveEngine,
  Cursor,
  ExternalEngine,
  MongoDBEngine,
  MinimongoEngine,
  MongoTextIndexEngine
} from './main';

EasySearch = {
  // Core
  Index,
  Engine,
  ReactiveEngine,
  Cursor,
  // Engines
  MongoDB: MongoDBEngine,
  Minimongo: MinimongoEngine,
  External: ExternalEngine,
  MongoTextIndex: MongoTextIndexEngine
};
