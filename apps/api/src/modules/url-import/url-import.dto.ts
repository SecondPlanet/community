import { ArrayMaxSize, ArrayMinSize, IsArray, IsUrl, MaxLength } from 'class-validator';

export class ImportFromUrlDto {
  @IsUrl({ protocols: ['http', 'https'] })
  @MaxLength(2048)
  url: string;
}

export class BatchImportFromUrlDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  urls: string[];
}