import React, { PureComponent } from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions, Frame } from 'types';
import { Map, View } from 'ol';
import XYZ from 'ol/source/XYZ';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { fromLonLat } from 'ol/proj';
import { defaults, DragPan, MouseWheelZoom } from 'ol/interaction';
import { platformModifierKeyOnly } from 'ol/events/condition';
import Select from 'ol/interaction/Select';
import { Style, Fill, Stroke } from 'ol/style';
import { pointerMove } from 'ol/events/condition';
import { SelectEvent } from 'ol/interaction/Select';
import { createPolygonLayer, processTransitionData, createHeatInfo } from './utils/helpers';
import { nanoid } from 'nanoid';
import 'ol/ol.css';

interface Props extends PanelProps<PanelOptions> {}
interface State {
  currentPolygon: string | null;
}

export class MainPanel extends PureComponent<Props, State> {
  id = 'id' + nanoid();
  map: Map;
  randomTile: TileLayer;
  infoMap: VectorLayer;
  startObj: { [key: string]: { [key: string]: number } } | null;
  destObj: { [key: string]: { [key: string]: number } } | null;

  state: State = {
    currentPolygon: null,
  };

  componentDidMount() {
    const { tile_url, zoom_level, center_lon, center_lat, geojson } = this.props.options;

    const carto1 = new TileLayer({
      source: new XYZ({
        url: 'https://{1-4}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      }),
    });

    this.map = new Map({
      interactions: defaults({ dragPan: false, mouseWheelZoom: false, onFocusOnly: true }).extend([
        new DragPan({
          condition: function(event) {
            return platformModifierKeyOnly(event) || this.getPointerCount() === 2;
          },
        }),
        new MouseWheelZoom({
          condition: platformModifierKeyOnly,
        }),
      ]),
      layers: [carto1],
      view: new View({
        center: fromLonLat([center_lon, center_lat]),
        zoom: zoom_level,
      }),
      target: this.id,
    });

    if (tile_url !== '') {
      this.randomTile = new TileLayer({
        source: new XYZ({
          url: tile_url,
        }),
        zIndex: 1,
      });
      this.map.addLayer(this.randomTile);
    }

    if (this.props.data.series.length > 0 && geojson) {
      const buildingLayer = createPolygonLayer(geojson);

      this.map.addLayer(buildingLayer);
      const serie = this.props.data.series[0] as Frame;
      if (serie.fields[0].values.buffer.length > 0) {
        const { startObj, destObj } = processTransitionData(serie.fields[0].values.buffer);
        this.startObj = startObj;
        this.destObj = destObj;
      }
    }

    const hoverInteraction = new Select({
      condition: pointerMove,
      style: function(feature) {
        const style: { [key: string]: any[] } = {};
        const geometry_type = feature.getGeometry().getType();

        style['Polygon'] = [
          new Style({
            fill: new Fill({
              color: '#ffffff00',
            }),
            stroke: new Stroke({
              color: '#49A8DE',
              width: 1,
            }),
          }),
        ];

        return style[geometry_type];
      },
    });

    hoverInteraction.on('select', (e: SelectEvent) => {
      const selectedFeature = e.target.getFeatures().item(0);

      if (selectedFeature) {
        if (selectedFeature.get('label') !== this.state.currentPolygon) {
          this.setState({ currentPolygon: selectedFeature.get('label') });
        }
      } else {
        this.setState({ currentPolygon: null });
      }
    });

    this.map.addInteraction(hoverInteraction);
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (prevProps.data.series !== this.props.data.series) {
      this.setState({ currentPolygon: null });
      if (this.props.options.geojson) {
        this.map.removeLayer(this.infoMap);

        if (this.props.data.series.length > 0) {
          const serie = this.props.data.series[0] as Frame;

          if (serie.fields[0].values.buffer.length > 0) {
            const { startObj, destObj } = processTransitionData(serie.fields[0].values.buffer);
            this.startObj = startObj;
            this.destObj = destObj;
          }
        } else {
          this.startObj = null;
          this.destObj = null;
        }
      }
    }

    if (prevProps.options.tile_url !== this.props.options.tile_url) {
      this.map.removeLayer(this.randomTile);
      if (this.props.options.tile_url !== '') {
        this.randomTile = new TileLayer({
          source: new XYZ({
            url: this.props.options.tile_url,
          }),
          zIndex: 1,
        });
        this.map.addLayer(this.randomTile);
      }
    }

    if (prevProps.options.zoom_level !== this.props.options.zoom_level) {
      this.map.getView().setZoom(this.props.options.zoom_level);
    }

    if (
      prevProps.options.center_lat !== this.props.options.center_lat ||
      prevProps.options.center_lon !== this.props.options.center_lon
    ) {
      this.map.getView().animate({
        center: fromLonLat([this.props.options.center_lon, this.props.options.center_lat]),
        duration: 2000,
      });
    }

    if (this.props.options.geojson && prevState.currentPolygon !== this.state.currentPolygon) {
      this.map.removeLayer(this.infoMap);
      if (!this.state.currentPolygon) {
        return;
      }
      const currentStore = this.state.currentPolygon;

      if (this.startObj && this.destObj && (this.startObj[currentStore] || this.destObj[currentStore])) {
        this.infoMap = createHeatInfo(
          this.props.options.geojson,
          this.startObj[currentStore],
          this.destObj[currentStore]
        );

        this.map.addLayer(this.infoMap);
      }
    }
  }

  render() {
    const { width, height } = this.props;

    return <div id={this.id} style={{ width, height }} />;
  }
}
