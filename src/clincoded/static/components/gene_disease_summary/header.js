'use strict';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';
import { external_url_map } from '../globals';

class GeneDiseaseEvidenceSummaryHeader extends Component {
    constructor(props) {
        super(props);
        this.state = {
            gdm: this.props.gdm,
            provisional: this.props.provisional
        };
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.gdm) {
            this.setState({gdm: nextProps.gdm});
        }
        if (nextProps.provisional) {
            this.setState({provisional: nextProps.provisional});
        }
    }

    render() {
        const gdm = this.state.gdm;
        const provisional = this.state.provisional;
        // Expecting the required fields of a GDM to always have values:
        // e.g. gene, disease, mode of inheritance
        const gene = gdm && gdm.gene, disease = gdm && gdm.disease;
        const modeInheritance = gdm && gdm.modeInheritance.match(/^(.*?)(?: \(HP:[0-9]*?\)){0,1}$/)[1];
        const modeInheritanceAdjective = gdm && gdm.modeInheritanceAdjective ? gdm.modeInheritanceAdjective.match(/^(.*?)(?: \(HP:[0-9]*?\)){0,1}$/)[1] : null;

        return (
            <div className="evidence-summary panel-header">
                <h1>Evidence Summary</h1>
                <div className="panel panel-primary">
                    <div className="panel-heading">
                        <h3 className="panel-title">
                            {gene && gene.symbol ? gene.symbol : null} – {disease && disease.term ? disease.term : null} – <i>{modeInheritanceAdjective ? modeInheritance + ' (' + modeInheritanceAdjective + ')' : modeInheritance}</i>
                        </h3>
                    </div>
                    <div className="panel-body">
                        <dl className="inline-dl clearfix col-sm-6">
                            <dt>Classification owner:</dt>
                            <dd className="summaryOwnerName">{provisional && provisional.submitted_by ? provisional.submitted_by.title : null}</dd>
                            <dt>Calculated Provisional classification:</dt>
                            <dd className="classificationSaved">{provisional ? provisional.autoClassification : null}</dd>
                            <dt>Modified Provisional Classification:</dt>
                            <dd className="classificationModified">
                                {provisional && provisional.alteredClassification ? (provisional.alteredClassification === 'No Selection' ? 'None' : provisional.alteredClassification) : null}
                            </dd>
                        </dl>
                        <dl className="inline-dl clearfix col-sm-6">
                            <dt>Classification status:</dt>
                            <dd className="classificationStatus">{provisional && provisional.classificationStatus ? provisional.classificationStatus : null}</dd>
                            {provisional ?
                                <div>
                                    <dt>Date classification saved:</dt>
                                    <dd className="classificationSaved">{provisional ? moment(provisional.last_modified).format("YYYY MMM DD, h:mm a") : null}</dd>
                                </div>
                                : null}
                            <dt>Disease:</dt>
                            <dd className="disease-term">{disease && disease.term ? <a href={external_url_map['MondoSearch'] + disease.diseaseId} target="_blank">{disease.term}</a> : null}</dd>
                        </dl>
                    </div>
                </div>
            </div>
        );
    }
}

GeneDiseaseEvidenceSummaryHeader.propTypes = {
    gdm: PropTypes.object,
    provisional: PropTypes.object
};

export default GeneDiseaseEvidenceSummaryHeader;