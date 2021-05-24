import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppMetadataDocument = AppMetadata & Document;

@Schema()
export class AppMetadata {
  @Prop()
  staticId: number;

  @Prop()
  currentBlockNumber: number;
}

export const AppMetadataSchema = SchemaFactory.createForClass(AppMetadata);